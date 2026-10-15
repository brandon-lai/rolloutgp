import type { BodyRecipe } from "../../sim/body.ts";
import { TopBar } from "../ui.tsx";
export function BodyShop({ initial }: { initial?: BodyRecipe }) {
  void initial;
  return <div className="screen"><TopBar title="Body shop" /></div>;
}
