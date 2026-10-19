"use client";

import { ChangeEvent, FormEvent, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useRequireUser } from "@/lib/auth/UserAuth";
import { bookingApi } from "@/lib/api/client";
import { ApiError } from "@/lib/api/types";

const SUBMIT_ERRORS: Record<string, string> = {
    INVALID_INPUT: "Some details are missing or invalid. Please review every step and try again.",
    INVALID_FILE_TYPE: "Only genuine PDF, JPG or PNG files are accepted.",
    FILE_TOO_LARGE: "A file is larger than 5MB.",
    NETWORK: "Unable to reach the server. Make sure the backend is running and try again.",
    UNKNOWN: "We could not submit your request. Please try again.",
};

const CATEGORIES = [
    { value: "Executive Suite - Category-A", label: "Executive Suite — Category-A (Free)", rate: 0 },
    { value: "Executive Suite - Category-B", label: "Executive Suite — Category-B (₹3,500/night)", rate: 3500 },
    { value: "Business Room - Category-A", label: "Business Room — Category-A (Free)", rate: 0 },
    { value: "Business Room - Category-B-1", label: "Business Room — Category B-1 (₹2,000/night)", rate: 2000 },
    { value: "Business Room - Category-B-2", label: "Business Room — Category B-2 (₹1,200/night)", rate: 1200 },
];

const GENDERS = ["Male", "Female", "Other"];
const RELATIONS = ["Self", "Family", "Relative", "Guest", "Parent", "Spouse", "Other"];
const ID_TYPES = ["Aadhaar", "Passport", "Voter ID", "Government ID"];

interface Guest {
    name: string;
    gender: string;
    age: string;
    relation: string;
    idType: string;
    idNumber: string;
    arrival: string;
    departure: string;
}

interface BookingForm {
    name: string;
    email: string;
    designation: string;
    department: string;
    employeeCode: string;
    mobile: string;
    category: string;
    payment: string;
    purpose: string;
    project: string;
    rooms: string;
    approverEmail: string;
    guests: Guest[];
    primaryIdFile: string;
    approvalFile: string;
    agreed: boolean;
}

const emptyGuest = (): Guest => ({
    name: "",
    gender: "",
    age: "",
    relation: "",
    idType: "",
    idNumber: "",
    arrival: "",
    departure: "",
});

const initialForm: BookingForm = {
    name: "",
    email: "",
    designation: "",
    department: "",
    employeeCode: "",
    mobile: "",
    category: "",
    payment: "",
    purpose: "",
    project: "",
    rooms: "1",
    approverEmail: "",
    guests: [emptyGuest()],
    primaryIdFile: "",
    approvalFile: "",
    agreed: false,
};

export default function BookingPage() {
    const router = useRouter();
    const { status: authStatus, account } = useRequireUser("/user/book");
    const [step, setStep] = useState(1);
    const [form, setForm] = useState<BookingForm>(initialForm);
    const [files, setFiles] = useState<{ primary: File | null; approval: File | null }>({ primary: null, approval: null });
    const [submitting, setSubmitting] = useState(false);
    const [error, setError] = useState("");

    // the booking is always filed under the signed-in account's e-mail
    useEffect(() => {
        if (account) {
            setForm((current) => ({ ...current, email: account.email, name: current.name || account.name }));
        }
    }, [account]);

    const selectedCategory = CATEGORIES.find((item) => item.label === form.category);

    const nights = useMemo(() => {
        const dates = form.guests
            .map((guest) => ({ arrival: guest.arrival, departure: guest.departure }))
            .filter((item) => item.arrival && item.departure);

        if (!dates.length) return 0;

        const firstArrival = new Date(dates[0].arrival).getTime();
        const lastDeparture = new Date(dates[0].departure).getTime();
        if (!Number.isFinite(firstArrival) || !Number.isFinite(lastDeparture) || lastDeparture <= firstArrival) return 0;

        return Math.max(1, Math.ceil((lastDeparture - firstArrival) / 86400000));
    }, [form.guests]);

    const roomCount = Number(form.rooms) || 0;
    const roomCharges = (selectedCategory?.rate ?? 0) * nights * roomCount;

    function updateField(name: keyof BookingForm, value: string | boolean) {
        setForm((current) => ({ ...current, [name]: value }));
        setError("");
    }

    function updateGuest(index: number, name: keyof Guest, value: string) {
        setForm((current) => ({
            ...current,
            guests: current.guests.map((guest, guestIndex) =>
                guestIndex === index ? { ...guest, [name]: value } : guest
            ),
        }));
        setError("");
    }

    function addGuest() {
        if (form.guests.length < 4) {
            setForm((current) => ({ ...current, guests: [...current.guests, emptyGuest()] }));
        }
    }

    function removeGuest(index: number) {
        if (index === 0) return;
        setForm((current) => ({
            ...current,
            guests: current.guests.filter((_, guestIndex) => guestIndex !== index),
        }));
    }

    function handleFile(event: ChangeEvent<HTMLInputElement>, field: "primaryIdFile" | "approvalFile") {
        const file = event.target.files?.[0] ?? null;
        const key = field === "primaryIdFile" ? "primary" : "approval";
        if (file && file.size > 5 * 1024 * 1024) {
            event.target.value = "";
            setFiles((current) => ({ ...current, [key]: null }));
            updateField(field, "");
            setError("File is too large. Maximum size is 5MB.");
            return;
        }
        setFiles((current) => ({ ...current, [key]: file }));
        updateField(field, file?.name ?? "");
    }

    function nextStep() {
        setError("");

        if (step === 1 && !form.name.trim()) return setError("Please enter the applicant / proposer name.");
        if (step === 1 && !/^.+@iitrpr\.ac\.in$/i.test(form.email)) return setError("Please use an official @iitrpr.ac.in email address.");
        if (step === 1 && (!form.designation || !form.department || !form.employeeCode || !form.mobile)) {
            return setError("Please complete all required applicant details.");
        }
        if (step === 1 && (!form.category || !form.payment || !form.purpose || !form.rooms)) {
            return setError("Please complete all required booking information.");
        }

        if (step === 2) {
            const invalidGuest = form.guests.some(
                (guest) => !guest.name || !guest.gender || !guest.age || !guest.relation || !guest.arrival || !guest.departure
            );
            if (invalidGuest) return setError("Please complete the required details for every guest.");
            const invalidDates = form.guests.some(
                (guest) => new Date(guest.departure).getTime() <= new Date(guest.arrival).getTime()
            );
            if (invalidDates) return setError("Each check-out date/time must be after the check-in date/time.");
        }

        if (step === 3 && !form.primaryIdFile) {
            return setError("Please attach the primary guest government photo ID proof.");
        }

        setStep((current) => Math.min(4, current + 1));
    }

    async function submitBooking(event: FormEvent<HTMLFormElement>) {
        event.preventDefault();

        if (!form.agreed) {
            setError("Please agree to the Guest House Terms & Conditions before submitting.");
            return;
        }
        if (!files.primary) {
            setError("Please attach the primary guest government photo ID proof.");
            return;
        }

        setSubmitting(true);
        setError("");
        try {
            const result = await bookingApi.create(form, files.primary, files.approval);
            sessionStorage.setItem("gh_last_booking_id", result.bookingId);
            router.push("/user/confirmation");
        } catch (e) {
            const code = e instanceof ApiError ? e.code : "UNKNOWN";
            if (code === "UNAUTHENTICATED") {
                sessionStorage.setItem("gh_after_login", "/user/book");
                router.replace("/user/login");
                return;
            }
            setError(SUBMIT_ERRORS[code] ?? SUBMIT_ERRORS.UNKNOWN);
        } finally {
            setSubmitting(false);
        }
    }

    if (authStatus !== "authed") {
        return <div className="page-shell"><p>Loading…</p></div>;
    }

    return (
        <div className="page-shell booking-flow-page">
            <div className="content-heading booking-heading">
                <h1>Book Accommodation</h1>
                <p>Complete the reservation form in four steps. Calculation details are visible before submission.</p>
            </div>

            <Stepper step={step} />

            {error && <div className="form-error" role="alert">{error}</div>}

            {step === 1 && (
                <StepOne form={form} updateField={updateField} />
            )}

            {step === 2 && (
                <StepTwo form={form} updateGuest={updateGuest} addGuest={addGuest} removeGuest={removeGuest} />
            )}

            {step === 3 && (
                <StepThree form={form} handleFile={handleFile} />
            )}

            {step === 4 && (
                <StepFour
                    form={form}
                    selectedCategory={selectedCategory}
                    nights={nights}
                    roomCharges={roomCharges}
                    updateField={updateField}
                />
            )}

            <div className="flow-actions">
                <button
                    type="button"
                    className="secondary-button"
                    onClick={() => (step === 1 ? router.push("/user") : setStep((current) => current - 1))}
                >
                    ← Back
                </button>

                {step < 4 ? (
                    <button type="button" className="primary-button" onClick={nextStep}>
                        Next ({step === 1 ? "Guest Details" : step === 2 ? "Documents" : "Review"}) →
                    </button>
                ) : (
                    <form onSubmit={submitBooking}>
                        <button type="submit" className="primary-button" disabled={submitting}>{submitting ? "Submitting…" : "Submit Request →"}</button>
                    </form>
                )}
            </div>
        </div>
    );
}

function Stepper({ step }: { step: number }) {
    const labels = ["Applicant Details", "Guest Details", "Documents", "Review & Submit"];
    return (
        <div className="booking-stepper">
            {labels.map((label, index) => {
                const number = index + 1;
                const complete = number < step;
                const active = number === step;
                return (
                    <div className={`booking-step ${active ? "active" : ""} ${complete ? "complete" : ""}`} key={label}>
                        <span>{complete ? "✓" : number}</span>
                        <b>{label}</b>
                    </div>
                );
            })}
        </div>
    );
}

function StepOne({ form, updateField }: { form: BookingForm; updateField: (name: keyof BookingForm, value: string | boolean) => void }) {
    return (
        <>
            <section className="form-section">
                <h2>1. Applicant / Proposer Details</h2>
                <div className="form-grid">
                    <Field label="Name of Applicant / Proposer *" value={form.name} onChange={(value) => updateField("name", value)} placeholder="Enter your name" required />
                    <Field label="Email id *" value={form.email} onChange={(value) => updateField("email", value)} placeholder="yourname@iitrpr.ac.in" type="email" required readOnly hint="Your signed-in @iitrpr.ac.in account" />
                    <SelectField label="Designation *" value={form.designation} onChange={(value) => updateField("designation", value)} options={["Faculty", "Staff", "Student", "Research Scholar", "Other"]} required />
                    <SelectField label="Department *" value={form.department} onChange={(value) => updateField("department", value)} options={["Computer Science & Engineering", "Electrical Engineering", "Mechanical Engineering", "Civil Engineering", "Other"]} required />
                    <Field label="Employee Code / Entry Number *" value={form.employeeCode} onChange={(value) => updateField("employeeCode", value)} placeholder="Enter employee code / entry number" required />
                    <Field label="Mobile Number *" value={form.mobile} onChange={(value) => updateField("mobile", value)} placeholder="Enter mobile number" type="tel" required />
                </div>
            </section>

            <section className="form-section">
                <h2>2. Booking Information</h2>
                <div className="form-grid">
                    <SelectField label="Category *" value={form.category} onChange={(value) => updateField("category", value)} options={CATEGORIES.map((item) => item.label)} required />
                    <SelectField label="Payment to be made by *" value={form.payment} onChange={(value) => updateField("payment", value)} options={["Institute Funds", "Project Funds", "Self / Other"]} required />
                    <Field label="Purpose of Visit *" value={form.purpose} onChange={(value) => updateField("purpose", value)} placeholder="Academic, research, conference, collaboration, etc." required />
                    <Field label="Project No. / Budget Head / Other" value={form.project} onChange={(value) => updateField("project", value)} placeholder="Enter details where applicable" />
                    <SelectField label="Number of Rooms Required *" value={form.rooms} onChange={(value) => updateField("rooms", value)} options={["1", "2", "3", "4", "5", "6", "7", "8", "9", "10"]} required />
                    <Field label="Approver Official Email" value={form.approverEmail} onChange={(value) => updateField("approverEmail", value)} placeholder="approver@iitrpr.ac.in" type="email" hint="Optional: used to notify the competent approver" />
                </div>
            </section>

            <section className="policy-note">
                <strong>Before continuing</strong>
                <span>Proposer should be from IIT Ropar side. Check-in is 01:00 PM and check-out is 11:00 AM. Accommodation is subject to availability and approval of the competent authority.</span>
            </section>
        </>
    );
}

function StepTwo({ form, updateGuest, addGuest, removeGuest }: { form: BookingForm; updateGuest: (index: number, name: keyof Guest, value: string) => void; addGuest: () => void; removeGuest: (index: number) => void }) {
    return (
        <>
            {form.guests.map((guest, index) => (
                <section className="form-section" key={index}>
                    <div className="section-title-row">
                        <h2>{index + 1}. Guest Information {index > 0 ? `(Guest ${String(index + 1).padStart(2, "0")})` : "(Primary Guest)"}</h2>
                        {index > 0 && <button type="button" className="remove-guest" onClick={() => removeGuest(index)}>Remove</button>}
                    </div>
                    <div className="form-grid">
                        <Field label="Guest Full Name *" value={guest.name} onChange={(value) => updateGuest(index, "name", value)} placeholder="Enter primary guest name" required />
                        <SelectField label="Gender *" value={guest.gender} onChange={(value) => updateGuest(index, "gender", value)} options={GENDERS} required />
                        <SelectField label="Relation to Applicant *" value={guest.relation} onChange={(value) => updateGuest(index, "relation", value)} options={RELATIONS} required />
                        <Field label="Age / Date of Birth *" value={guest.age} onChange={(value) => updateGuest(index, "age", value)} placeholder="Enter age or date of birth" required />
                        <SelectField label="ID Proof Type" value={guest.idType} onChange={(value) => updateGuest(index, "idType", value)} options={ID_TYPES} />
                        <Field label="ID Proof Number / Govt Reg. No." value={guest.idNumber} onChange={(value) => updateGuest(index, "idNumber", value)} placeholder="Enter identification number" />
                    </div>
                </section>
            ))}

            <section className="form-section">
                <h2>2. Stay & Arrival Schedule</h2>
                <div className="form-grid">
                    <DateTimeField label="Check-in Date & Time *" value={form.guests[0].arrival} onChange={(value) => updateGuest(0, "arrival", value)} />
                    <DateTimeField label="Check-out Date & Time *" value={form.guests[0].departure} onChange={(value) => updateGuest(0, "departure", value)} />
                </div>
                <div className="section-bottom-row">
                    <button type="button" className="secondary-button compact-button" onClick={addGuest} disabled={form.guests.length >= 4}>
                        + Add Additional Guest
                    </button>
                    <span>Up to 4 guests can be entered in this frontend prototype.</span>
                </div>
            </section>

            <section className="calculation-mini">
                <strong>Calculation details will be visible to the applicant.</strong>
                <span>Room charges are calculated from the selected room category, number of rooms and stay duration.</span>
            </section>
        </>
    );
}

function StepThree({ form, handleFile }: { form: BookingForm; handleFile: (event: ChangeEvent<HTMLInputElement>, field: "primaryIdFile" | "approvalFile") => void }) {
    return (
        <section className="form-section documents-section">
            <h2>3. Upload Supporting Documents</h2>
            <div className="documents-content">
                <UploadField
                    title="1. Primary Guest Govt Photo ID Proof (Aadhaar / Passport / Voter ID) *"
                    fileName={form.primaryIdFile}
                    onChange={(event) => handleFile(event, "primaryIdFile")}
                    required
                />
                <UploadField
                    title="2. Official Approval / Request Letter / Event Invitation (where applicable)"
                    fileName={form.approvalFile}
                    onChange={(event) => handleFile(event, "approvalFile")}
                />
                <div className="attached-files">
                    <strong>Attached Files</strong>
                    {form.primaryIdFile && <div className="file-chip">📄 {form.primaryIdFile}</div>}
                    {form.approvalFile && <div className="file-chip">📄 {form.approvalFile}</div>}
                    {!form.primaryIdFile && !form.approvalFile && <span>No files selected yet.</span>}
                </div>
            </div>
        </section>
    );
}

function StepFour({ form, selectedCategory, nights, roomCharges, updateField }: { form: BookingForm; selectedCategory?: { value: string; label: string; rate: number }; nights: number; roomCharges: number; updateField: (name: keyof BookingForm, value: string | boolean) => void }) {
    const primaryGuest = form.guests[0];
    return (
        <>
            <section className="review-card">
                <h2>4. Review & Submit</h2>
                <div className="review-grid">
                    <ReviewItem label="Applicant / Proposer" value={form.name} />
                    <ReviewItem label="Email" value={form.email} />
                    <ReviewItem label="Category" value={selectedCategory?.label || "—"} />
                    <ReviewItem label="Payment" value={form.payment} />
                    <ReviewItem label="Purpose of Visit" value={form.purpose} />
                    <ReviewItem label="Number of Rooms" value={form.rooms} />
                    <ReviewItem label="Primary Guest" value={primaryGuest.name} />
                    <ReviewItem label="Guests Entered" value={String(form.guests.length)} />
                </div>
            </section>

            <section className="summary-box detailed-summary">
                <div>
                    <strong>Calculation Summary</strong>
                    <span>{nights || 0} night(s) × {form.rooms || 0} room(s) × ₹{selectedCategory?.rate?.toLocaleString("en-IN") ?? "0"} per room/night</span>
                </div>
                <div className="summary-amount">₹{roomCharges.toLocaleString("en-IN")}</div>
            </section>

            <section className="policy-note">
                <strong>Important</strong>
                <span>GST charges will be extra as applicable. No GST applies to internal bookings from Institute Funds. Supporting documents and approval from the competent authority are required wherever applicable.</span>
            </section>

            <label className="terms-check">
                <input type="checkbox" checked={form.agreed} onChange={(event) => updateField("agreed", event.target.checked)} />
                <span>I Agree to the Terms & Conditions</span>
            </label>
        </>
    );
}

function ReviewItem({ label, value }: { label: string; value: string }) {
    return <div className="review-item"><span>{label}</span><strong>{value || "—"}</strong></div>;
}

function UploadField({ title, fileName, onChange, required = false }: { title: string; fileName: string; onChange: (event: ChangeEvent<HTMLInputElement>) => void; required?: boolean }) {
    return (
        <label className="upload-area">
            <strong>{title}</strong>
            <div className="drop-zone">
                <span className="upload-plus">+</span>
                <b>{fileName ? fileName : "Drag and drop file here, or browse"}</b>
                <small>Supported formats: PDF, JPG, PNG (Max file size: 5MB)</small>
            </div>
            <input type="file" accept=".pdf,.jpg,.jpeg,.png" onChange={onChange} required={required} />
        </label>
    );
}

function Field({ label, value, onChange, placeholder, type = "text", required = false, hint, readOnly = false }: { label: string; value: string; onChange: (value: string) => void; placeholder?: string; type?: string; required?: boolean; hint?: string; readOnly?: boolean }) {
    return (
        <label className="field">
            <span>{label}</span>
            <input value={value} onChange={(event) => onChange(event.target.value)} placeholder={placeholder} type={type} required={required} readOnly={readOnly} />
            {hint && <small>{hint}</small>}
        </label>
    );
}

function SelectField({ label, value, onChange, options, required = false }: { label: string; value: string; onChange: (value: string) => void; options: string[]; required?: boolean }) {
    return (
        <label className="field">
            <span>{label}</span>
            <select value={value} onChange={(event) => onChange(event.target.value)} required={required}>
                <option value="">Choose an item</option>
                {options.map((option) => <option key={option} value={option}>{option}</option>)}
            </select>
        </label>
    );
}

function DateTimeField({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
    return <Field label={label} value={value} onChange={onChange} type="datetime-local" required />;
}
