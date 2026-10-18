import Link from "next/link";

export default function UserFooter() {
    return (
        <footer className="site-footer">
            <div className="footer-brand"><div className="brand-mark small">IIT</div><div><div className="brand-hi">भारतीय प्रौद्योगिकी संस्थान रोपड़</div><div className="brand-en">Indian Institute of Technology Ropar</div></div></div>
            <div className="footer-links"><Link href="/user">Home</Link><Link href="/user/book">Book Online</Link><Link href="/user/status">Booking Status</Link><a href="mailto:guesthouse@iitrpr.ac.in">Contact Us</a></div>
        </footer>
    );
}
