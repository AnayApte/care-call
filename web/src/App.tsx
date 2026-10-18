import PatientPage from "./pages/PatientPage";
import CaregiverPage from "./pages/CaregiverPage";
import BeaconPage from "./pages/BeaconPage";
import CaregiverReportPage from "./pages/CaregiverReportPage";

/** The path decides; report links work after a direct load or refresh. */
export default function App() {
  const path = window.location.pathname.replace(/\/+$/, "");
  if (path === "/caregiver") return <CaregiverPage />;
  const report = path.match(/^\/caregiver\/reports\/([^/]+)$/);
  if (report) return <CaregiverReportPage reportId={report[1]} />;
  if (path === "/beacon") return <BeaconPage />;
  return <PatientPage />;
}
