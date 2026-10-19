import React, { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import DiveMDiagnostic from "./DiveMDiagnostic";
import PersonaPhotoStudio from "./PersonaPhotoStudio";

function Root() {
  const [hash, setHash] = useState(location.hash);
  useEffect(() => {
    const update = () => setHash(location.hash);
    addEventListener("hashchange", update);
    return () => removeEventListener("hashchange", update);
  }, []);
  if (hash === "#persona-photo") return <PersonaPhotoStudio />;
  if (hash === "#divem") return <DiveMDiagnostic />;
  return <App />;
}

createRoot(document.getElementById("root")!).render(<React.StrictMode><Root /></React.StrictMode>);
if ("serviceWorker" in navigator) navigator.serviceWorker.register("/sw.js");
