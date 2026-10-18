import Link from "next/link";

const categories = [
  "Executive Suite (Category - A)",
  "Executive Suite (Category - B)",
  "Business Room (Category - A)",
  "Business Room (Category - B-1)",
  "Business Room (Category - B-2)",
];

const tariffRows = [
  {
    room: "Executive Suite Room",
    category: "Category-A",
    tariff: "Free",
    eligibility: [
      "Institute-invited guests who are members of statutory bodies.",
      "Chairman, BOG, Directors of IITs and other CFTIs, and VCs of CFTIs.",
      "Experts for selection committees and academic evaluation, including thesis proposals, seminars, and thesis defense.",
      "Other guests with permission from the Director.",
    ],
    authority: "Director / Concerned Dean",
  },
  {
    room: "Executive Suite Room",
    category: "Category-B",
    tariff: "₹3,500",
    eligibility: [
      "Faculty/staff for themselves, their family, or relatives.",
      "IIT Ropar alumni.",
      "Parents of students or spouses of students.",
      "Officials from Central and State Ministries/Administration.",
    ],
    authority: "Chairman, Guest House Committee",
  },
  {
    room: "Business Room",
    category: "Category-A",
    tariff: "Free",
    eligibility: [
      "Institute-invited guests who are members of statutory bodies.",
      "Chairman, BOG, Directors of IITs and other CFTIs, and VCs of CFTIs.",
      "Experts for selection committees and academic evaluation, including thesis proposals, seminars, and thesis defense.",
      "Other guests with permission from the Director.",
    ],
    authority:
      "Registrar / Concerned Dean / Associate Dean for listed guests; Director for other guests.",
  },
  {
    room: "Business Room",
    category: "Category B-1",
    tariff: "₹2,000",
    eligibility: [
      "Guests invited by sponsored projects, faculty collaborations, consultancy, short-term courses, seminars, conferences, etc.",
    ],
    authority:
      "Concerned Deans, Associate Deans, HoDs, or Registrar, as applicable.",
  },
  {
    room: "Business Room",
    category: "Category B-2",
    tariff: "₹1,200",
    eligibility: [
      "Faculty/staff for themselves, their family, or relatives.",
      "IIT Ropar alumni.",
      "Parents of students or spouses of students.",
      "Officials from Central and State Ministries/Administration.",
    ],
    authority: "Chairman, Guest House Committee",
  },
];

const guidelines = [
  "Regular booking requests must be submitted at least two days before the guest's arrival.",
  "Accommodation is subject to approval by the competent authority and room availability.",
  "Supporting documents and approval from the competent authority must be attached wherever applicable.",
  "A minimum one-day charge applies unless the booking is cancelled at least 24 hours before the booked date.",
  "For advance bulk bookings for conferences/workshops, cancellation requests should be made at least one week before the event. Failure may result in full charges for unused rooms.",
  "Bulk booking requests may not be made more than 90 days before the event.",
  "Students requiring accommodation for parents must route their requests through their respective Wardens and the Dean of Students.",
  "A maximum of two persons is allowed in a double-occupancy bedroom.",
  "Booking is not permitted for guests undergoing treatment/advice for communicable diseases, guests who are bedridden, or post-delivery cases.",
  "Pets, including dogs and cats, are not allowed in the Guest House.",
  "MHRD/Government of India clearance is required for guests or visitors holding foreign passports.",
  "In emergencies due to heavy booking, a single occupant may be asked to share accommodation with another guest.",
  "Requests for dining facilities should be communicated well in advance to the reception.",
  "Applicable GST is extra. No GST applies to internal bookings paid from Institute Funds.",
];

export default function HomePage() {
  return (
    <div className="page-shell home-page">
      <section className="hero">
        <div className="hero-image-placeholder">
          <div className="hero-overlay">
            <h1>IIT ROPAR</h1>
            <h2>GUEST HOUSE PORTAL</h2>
            <p>
              Comfortable stay, modern facilities and a home away from home
              for our guests.
            </p>
            <Link href="/user/book" className="primary-button hero-button">
              <span aria-hidden="true">▣</span> Book Online{" "}
              <span aria-hidden="true">→</span>
            </Link>
          </div>
        </div>
      </section>

      <section className="info-grid">
        <article className="info-card">
          <div className="card-icon" aria-hidden="true">▣</div>
          <h3>Room Categories</h3>
          <ul>
            {categories.map((item) => <li key={item}>{item}</li>)}
          </ul>
          <a href="#tariff">View Tariff &amp; Eligibility →</a>
        </article>

        <article className="info-card">
          <div className="card-icon" aria-hidden="true">▤</div>
          <h3>Guidelines</h3>
          <ul>
            <li>Check-in: 01:00 PM</li>
            <li>Check-out: 11:00 AM</li>
            <li>Accommodation is subject to availability and approval.</li>
            <li>Supporting documents are required wherever applicable.</li>
          </ul>
          <a href="#guidelines">View Full Guidelines →</a>
        </article>

        <article className="info-card">
          <div className="card-icon" aria-hidden="true">☎</div>
          <h3>Contact Us</h3>
          <ul className="contact-list">
            <li>IIT Ropar Guest House</li>
            <li>Rupnagar, Punjab - 140001</li>
            <li>Phone: 01881-236951</li>
            <li>Email: guesthouse@iitrpr.ac.in</li>
          </ul>
          <a href="#contact">Contact Details →</a>
        </article>
      </section>

      <section className="home-note">
        <span className="note-icon" aria-hidden="true">✓</span>
        <p>
          For bookings and other details, use the Book Online or Booking
          Status options in the top menu.
        </p>
        <div className="note-badge">Book / Status →</div>
      </section>

      <section id="tariff" className="simple-section">
        <h2>Guest House Charges and Categories</h2>
        <p>
          Review the applicable tariff, eligibility criteria, and approving
          authority before submitting your booking request.
        </p>

        <div className="table-responsive">
          <table className="tariff-table">
            <thead>
              <tr>
                <th>Room Category</th>
                <th>Tariff</th>
                <th>Eligibility</th>
                <th>Approving Authority</th>
              </tr>
            </thead>
            <tbody>
              {tariffRows.map((row, index) => (
                <tr key={`${row.room}-${row.category}-${index}`}>
                  <td>
                    <strong>{row.room}</strong>
                    <br />
                    {row.category}
                  </td>
                  <td><strong>{row.tariff}</strong></td>
                  <td>
                    <ul>
                      {row.eligibility.map((item, eligibilityIndex) => (
                        <li key={`${row.category}-eligibility-${eligibilityIndex}`}>
                          {item}
                        </li>
                      ))}
                    </ul>
                  </td>
                  <td>{row.authority}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="tariff-notes">
          <p><strong>1. GST:</strong> GST charges will be extra, as applicable.</p>
          <p><strong>2. Internal bookings:</strong> No GST applies to internal bookings paid from Institute Funds.</p>
          <p>
            <strong>3. Institute/project funding:</strong> If payment is made from Institute or project funds, no bill will ordinarily be raised; the budget of the respective department/section will be deducted. For projects or other externally funded events, the budget will be deducted and deposited in the IRG. A bill may be raised on request by the guests, organizers, or PIs, as applicable.
          </p>
          <p>
            <strong>4. Supporting documents:</strong> Supporting documents and approval from the competent authority must be attached to the booking form wherever applicable.
          </p>
        </div>

        <p className="booking-reminder">
          <strong>Important:</strong> The proposer must be from IIT Ropar.
          Accommodation is subject to availability and approval by the competent authority.
        </p>
      </section>

      <section id="guidelines" className="simple-section">
        <h2>Booking Guidelines</h2>
        <div className="checkin-note">
          <p><strong>Check-in time:</strong> 01:00 PM</p>
          <p><strong>Check-out time:</strong> 11:00 AM</p>
        </div>
        <ol className="guidelines-list">
          {guidelines.map((guideline, index) => (
            <li key={`guideline-${index}`}>{guideline}</li>
          ))}
        </ol>
        <p><strong>NOTE:</strong> The competent authority reserves the right to cancel, amend, or reschedule a booking.</p>
      </section>

      <section id="contact" className="simple-section">
        <h2>Contact Us</h2>
        <ul className="contact-details">
          <li><strong>Telephone:</strong> 01881-236951</li>
          <li>
            <strong>Email:</strong>{" "}
            <a href="mailto:guesthouse@iitrpr.ac.in"> guesthouse@iitrpr.ac.in</a>
          </li>
          <li>
            <strong>Website:</strong>{" "}
            <a href="https://www.iitrpr.ac.in" target="_blank" rel="noreferrer"> www.iitrpr.ac.in</a>
          </li>
          <li>Rupnagar, Punjab - 140001, India</li>
        </ul>
      </section>
    </div>
  );
}
