export default function DeferredLoading() {
  return (
    <section className="stream-card loading-card">
      <span>Loading</span>
      <h2>Loading deferred data</h2>
      <p>The route shell is already visible while the slow comments promise resolves.</p>
    </section>
  );
}
