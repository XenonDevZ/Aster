import { action, html, page, redirect } from "../../../../packages/aster-core/src/index.js";

export const sendMessage = action(async ({ formData }) => {
  const name = String(formData.get("name") ?? "").trim();
  const topic = String(formData.get("topic") ?? "").trim();

  return redirect(`/contact?sent=${encodeURIComponent(name || "friend")}&topic=${encodeURIComponent(topic || "Aster")}`, 303);
});

export function GET({ url }) {
  const sent = url.searchParams.get("sent");
  const topic = url.searchParams.get("topic");

  return page(
    html`<main class="contact-page">
      <section class="contact-copy">
        <p class="eyebrow">Server Actions</p>
        <h1>Forms can call server code directly.</h1>
        <p class="lede">
          This contact form posts to a generated Aster action endpoint. The server action reads FormData and redirects
          back with a confirmation state.
        </p>
      </section>

      <form class="contact-form" method="post" action="${sendMessage}">
        <label>
          <span>Name</span>
          <input name="name" placeholder="Ada" autocomplete="name" required />
        </label>
        <label>
          <span>Topic</span>
          <input name="topic" placeholder="Server actions" required />
        </label>
        <button type="submit">Send message</button>
      </form>

      ${sent
        ? html`<p class="notice" role="status">Message queued for ${sent} about ${topic}.</p>`
        : ""}
    </main>`,
    {
      title: "Aster Server Actions",
      head: html`<link rel="stylesheet" href="/styles.css" />`
    }
  );
}
