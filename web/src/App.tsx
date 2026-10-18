import PatientPage from "./pages/PatientPage";
import CaregiverPage from "./pages/CaregiverPage";
import BeaconPage from "./pages/BeaconPage";

/** Three pages, no router: the path decides. Unknown paths show the patient page. */
export default function App() {
  const path = window.location.pathname.replace(/\/+$/, "");
  if (path === "/caregiver") return <CaregiverPage />;
  if (path === "/beacon") return <BeaconPage />;
  return <PatientPage />;
}
