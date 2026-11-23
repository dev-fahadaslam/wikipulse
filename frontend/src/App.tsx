import { Dashboard } from "./Dashboard";
import { WikiPulseProvider } from "./store/WikiPulseContext";

export default function App() {
  return (
    <WikiPulseProvider>
      <Dashboard />
    </WikiPulseProvider>
  );
}
