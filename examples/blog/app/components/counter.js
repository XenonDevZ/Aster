export default function hydrate(host, props) {
  let count = Number(props.start ?? 0);
  const label = props.label ?? "Count";
  const button = host.querySelector("button") ?? document.createElement("button");

  button.type = "button";
  button.className = "counter";

  function render() {
    button.textContent = `${label}: ${count}`;
  }

  button.addEventListener("click", () => {
    count += 1;
    render();
  });

  render();

  if (!button.isConnected) {
    host.replaceChildren(button);
  }
}
