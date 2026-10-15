import { TopBar } from "../ui.tsx";
export function CityScreen({ initial }: { initial?: string }) {
  void initial;
  return <div className="screen"><TopBar title="City run" /></div>;
}
