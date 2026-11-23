from app.models import EditEvent
from app.vandalism import heuristic_assess, should_escalate_to_llm


def make_event(**overrides) -> EditEvent:
    defaults = dict(
        id=1,
        ts=1_000_000.0,
        wiki="enwiki",
        server_name="en.wikipedia.org",
        title="Some Article",
        url=None,
        user="RegularEditor",
        bot=False,
        minor=False,
        change_type="edit",
        comment="copyedit",
        length_old=1000,
        length_new=1010,
        delta=10,
    )
    defaults.update(overrides)
    return EditEvent(**defaults)


def test_normal_edit_is_not_flagged():
    event = make_event()
    info, _ = heuristic_assess(event)
    assert info.flagged is False
    assert info.score < 0.35


def test_blanking_is_flagged():
    event = make_event(
        length_old=5000, length_new=20, delta=-4980, comment="", user="123.45.67.89"
    )
    info, reasons = heuristic_assess(event)
    assert info.flagged is True
    assert info.score >= 0.6
    assert reasons
    assert info.reason is not None


def test_abusive_comment_is_flagged():
    event = make_event(comment="you are an idiot stupid page", delta=5, length_new=1005)
    info, _ = heuristic_assess(event)
    assert info.flagged is True


def test_bot_edits_are_never_flagged():
    event = make_event(
        bot=True, length_old=5000, length_new=0, delta=-5000, comment=""
    )
    info, reasons = heuristic_assess(event)
    assert info.flagged is False
    assert info.score == 0.0
    assert reasons == []


def test_large_legitimate_looking_merge_scores_lower_than_blanking():
    merge = make_event(
        length_old=5000, length_new=500, delta=-4500, comment="merged into parent article per talk page consensus"
    )
    blank = make_event(length_old=5000, length_new=20, delta=-4980, comment="")
    merge_info, _ = heuristic_assess(merge)
    blank_info, _ = heuristic_assess(blank)
    assert blank_info.score >= merge_info.score


def test_escalation_threshold_matches_flag_threshold_ordering():
    # Anything that escalates to the LLM should also be at/above the flag
    # threshold's neighborhood -- otherwise we'd spend API calls on edits we
    # don't even consider borderline.
    assert should_escalate_to_llm(0.9) is True
    assert should_escalate_to_llm(0.0) is False
