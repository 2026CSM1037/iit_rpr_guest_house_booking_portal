"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

const slides = [
  { image: "https://files.yappe.in/place/full/iit-ropar-guest-house-6381511.webp", alt: "IIT Ropar Guest House campus view" },
  { image: "https://images.unsplash.com/photo-1566073771259-6a8506099945?auto=format&fit=crop&w=2000&q=85", alt: "Comfortable hotel accommodation" },
  { image: "https://images.unsplash.com/photo-1611892440504-42a792e24d32?auto=format&fit=crop&w=2000&q=85", alt: "Guest room with comfortable furnishings" },
  { image: "https://images.unsplash.com/photo-1600210492486-724fe5c67fb0?auto=format&fit=crop&w=2000&q=85", alt: "Welcoming modern lounge interior" },
];

export default function HeroSlideshow() {
  const [active, setActive] = useState(0);
  useEffect(() => {
    const timer = window.setInterval(() => setActive((current) => (current + 1) % slides.length), 5500);
    return () => window.clearInterval(timer);
  }, []);
  const previous = () => setActive((current) => (current - 1 + slides.length) % slides.length);
  const next = () => setActive((current) => (current + 1) % slides.length);
  return (
    <section className="hero" aria-label={slides[active].alt}>
      <div className="hero-image-placeholder" style={{ backgroundImage: `linear-gradient(180deg, rgba(5,22,44,.24), rgba(2,22,48,.78)), url("${slides[active].image}")` }}>
        <div className="hero-overlay" key={active}>
          <span className="hero-eyebrow">WELCOME TO IIT ROPAR</span>
          <h1>IIT ROPAR</h1>
          <h2>GUEST HOUSE PORTAL</h2>
          <p>Comfortable stay, modern facilities and a home away from home for our guests.</p>
          <Link href="/user/book" className="primary-button hero-button"><span aria-hidden="true">▣</span> Book Online <span aria-hidden="true">→</span></Link>
        </div>
        <button type="button" className="hero-arrow hero-prev" onClick={previous} aria-label="Previous photo">‹</button>
        <button type="button" className="hero-arrow hero-next" onClick={next} aria-label="Next photo">›</button>
        <div className="hero-slide-controls" aria-label="Choose photo">
          {slides.map((slide, index) => <button key={slide.image} type="button" aria-label={`Show photo ${index + 1}`} aria-current={active === index ? "true" : undefined} className={active === index ? "active" : ""} onClick={() => setActive(index)} />)}
        </div>
        <span className="hero-photo-count">{String(active + 1).padStart(2, "0")} / {String(slides.length).padStart(2, "0")}</span>
      </div>
    </section>
  );
}
