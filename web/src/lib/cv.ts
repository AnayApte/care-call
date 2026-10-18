/** Patient screen bridge to Josh's camera, personal model and trigger. */
import { startHandTracker as startCamera } from "../cv/patientCamera";
import { startSimulatedTracker } from "../cv/patientSimulation";

export * from "../cv/patient";
export const USE_MOCK_HAND = import.meta.env.DEV && new URLSearchParams(window.location.search).get("mock") === "1";
export const startHandTracker = USE_MOCK_HAND ? startSimulatedTracker : startCamera;
