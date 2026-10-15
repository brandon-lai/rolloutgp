import { Component, type ReactNode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./app/App.tsx";
import "./app/styles.css";

class Recovery extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  render() {
    if (this.state.failed) return <main className="modal-back"><div className="panel modal" role="alert"><h2>The garage hit a snag</h2><p>Your saved data is still in this browser. Reload to try again.</p><button className="btn primary" onClick={() => location.reload()}>Reload</button></div></main>;
    return this.props.children;
  }
}
createRoot(document.getElementById("root")!).render(<Recovery><App /></Recovery>);
