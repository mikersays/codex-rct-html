import "./style.css";
import { ThemeParkGame } from "./game";

const app = document.querySelector<HTMLDivElement>("#app");

if (!app) {
  throw new Error("Missing #app root");
}

new ThemeParkGame(app);
