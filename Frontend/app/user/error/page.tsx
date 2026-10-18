 "use client";

import Link from "next/link";

export default function ErrorPage() {
  return (
    <div className="page-shell centered-page error-page">
      <div className="error-icon">!</div>
      <h1>Something went wrong!</h1>
      <p className="center-copy">We were unable to submit your request. Please check the details and try again. If the problem persists, contact the Guest House office.</p>

      <section className="error-box">
        <h2>Error Details</h2>
        <p>• Invalid email address or missing mandatory fields.</p>
      </section>

      <div className="two-actions">
        <Link href="/user/book" className="primary-button">Try Again</Link>
        <Link href="/user" className="secondary-button">Back to Home</Link>
      </div>
    </div>
  );
}