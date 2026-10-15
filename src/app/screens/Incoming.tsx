import { useApp } from "../state.tsx";
import { Modal } from "../ui.tsx";
import type { Incoming as Inc } from "../share.ts";
import { MAX_BUILDS, missingParts } from "../../store/profile.ts";
import { part } from "../../sim/parts.ts";

export function Incoming({ incoming, onClose }: { incoming: NonNullable<Inc>; onClose: () => void }) {
  const { profile, save, go, toast } = useApp();
  if (incoming.kind === "build") {
    const b = incoming.build;
    const missing = missingParts(profile, b);
    return (
      <Modal label="Shared build" onClose={onClose}>
        <h2>Someone shared a build</h2>
        <p>
          <b>{b.name}</b>: {part(b.motor).name}, {part(b.gear).name}, {part(b.tires).name}, {b.body.name} body.
        </p>
        {missing.length > 0 && <p className="small muted">You don't own {missing.length} of its parts yet ({missing.map((id) => part(id).name).join(", ")}). You can test it on the practice lane, but you'll need them to race it.</p>}
        <div className="row">
          <button
            className="btn primary"
            disabled={profile.builds.length >= MAX_BUILDS}
            onClick={() => {
              save((p) => ({ ...p, builds: [...p.builds, b], active: p.builds.length }));
              onClose();
              go({ name: "garage" });
              toast("Added to your garage");
            }}
          >
            <span>{profile.builds.length >= MAX_BUILDS ? "Garage full" : "Add to my garage"}</span>
          </button>
          <button className="btn ghost" onClick={onClose}>
            <span>No thanks</span>
          </button>
        </div>
      </Modal>
    );
  }
  const r = incoming.body;
  return (
    <Modal label="Shared body" onClose={onClose}>
      <h2>Someone shared a body</h2>
      <p>
        <b>{r.name}</b>, a {r.base} remix.
      </p>
      <div className="row">
        <button
          className="btn primary"
          onClick={() => {
            save((p) => ({ ...p, designs: [r, ...p.designs].slice(0, 24) }));
            onClose();
            go({ name: "body", recipe: r });
          }}
        >
          <span>Open in the body shop</span>
        </button>
        <button className="btn ghost" onClick={onClose}>
          <span>No thanks</span>
        </button>
      </div>
    </Modal>
  );
}
