import { render } from "solid-js/web";

function App() {
  return <h1>Latitude v2 rewrite scaffold</h1>;
}

const root = document.getElementById("root");

if (!root) {
  throw new Error("Missing root element");
}

render(() => <App />, root);
