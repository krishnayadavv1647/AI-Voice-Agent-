// app/data.jsx — realistic sample data
const AGENTS = [
  { id: "ag1", name: "Aarohi – Admissions", type: "Coaching Center Counselor", business: "Vidya Coaching Center", category: "Education", status: "Active", calls: 1284, leads: 412, success: 91, minutes: 5210, language: "Hinglish", voice: "Aarohi (Warm)", created: "Mar 12, 2026", slug: "vidya-coaching", phone: "+91 80 4710 2201" },
  { id: "ag2", name: "Rohan – Sales", type: "AI Sales Agent", business: "Nexa Realty", category: "Real Estate", status: "Active", calls: 932, leads: 268, success: 84, minutes: 4120, language: "English", voice: "Rohan (Confident)", created: "Feb 28, 2026", slug: "nexa-realty", phone: "+91 80 4710 2202" },
  { id: "ag3", name: "Meera – Reception", type: "AI Receptionist", business: "Smile Dental Clinic", category: "Healthcare", status: "Active", calls: 644, leads: 190, success: 88, minutes: 2380, language: "Hindi + English", voice: "Meera (Polite)", created: "Apr 02, 2026", slug: "smile-dental", phone: "+91 80 4710 2203" },
  { id: "ag4", name: "Kabir – Support", type: "AI Support Agent", business: "FloMart D2C", category: "E-commerce", status: "Paused", calls: 1520, leads: 88, success: 79, minutes: 6740, language: "English", voice: "Kabir (Expert)", created: "Jan 19, 2026", slug: "flomart", phone: "+91 80 4710 2204" },
  { id: "ag5", name: "Saanvi – Bookings", type: "Restaurant Booking Agent", business: "The Copper Spoon", category: "Restaurant", status: "Active", calls: 410, leads: 301, success: 93, minutes: 980, language: "English", voice: "Saanvi (Friendly)", created: "Apr 21, 2026", slug: "copper-spoon", phone: "+91 80 4710 2205" },
  { id: "ag6", name: "Vihaan – Loans", type: "Lead Qualification Agent", business: "TrustFin NBFC", category: "Banking", status: "Draft", calls: 0, leads: 0, success: 0, minutes: 0, language: "Hinglish", voice: "Vihaan (Calm)", created: "Jun 06, 2026", slug: "trustfin", phone: "—" },
];

const CALLS = [
  { id: "c1", caller: "+91 98290 11234", name: "Priya Nair", agent: "Aarohi – Admissions", agentId: "ag1", status: "Completed", duration: "4:12", sec: 252, time: "10:42 AM", date: "Jun 9", sentiment: "Positive", outcome: "Lead captured" },
  { id: "c2", caller: "+91 99876 55012", name: "Arjun Mehta", agent: "Rohan – Sales", agentId: "ag2", status: "Completed", duration: "6:38", sec: 398, time: "10:21 AM", date: "Jun 9", sentiment: "Positive", outcome: "Site visit booked" },
  { id: "c3", caller: "+91 90043 78821", name: "Unknown", agent: "Meera – Reception", agentId: "ag3", status: "Missed", duration: "0:00", sec: 0, time: "09:58 AM", date: "Jun 9", sentiment: "—", outcome: "No answer" },
  { id: "c4", caller: "+91 81234 99001", name: "Sana Kapoor", agent: "Aarohi – Admissions", agentId: "ag1", status: "Completed", duration: "3:05", sec: 185, time: "09:31 AM", date: "Jun 9", sentiment: "Neutral", outcome: "Info shared" },
  { id: "c5", caller: "+91 70219 44520", name: "Dev Sharma", agent: "Kabir – Support", agentId: "ag4", status: "Failed", duration: "0:14", sec: 14, time: "09:12 AM", date: "Jun 9", sentiment: "—", outcome: "Carrier error" },
  { id: "c6", caller: "+91 96500 21188", name: "Ananya Iyer", agent: "Saanvi – Bookings", agentId: "ag5", status: "Completed", duration: "2:47", sec: 167, time: "Yesterday", date: "Jun 8", sentiment: "Positive", outcome: "Table booked" },
  { id: "c7", caller: "+91 88001 23456", name: "Rahul Verma", agent: "Rohan – Sales", agentId: "ag2", status: "Completed", duration: "5:20", sec: 320, time: "Yesterday", date: "Jun 8", sentiment: "Positive", outcome: "Lead captured" },
  { id: "c8", caller: "+91 73910 65432", name: "Ishita Bose", agent: "Aarohi – Admissions", agentId: "ag1", status: "Completed", duration: "7:02", sec: 422, time: "Yesterday", date: "Jun 8", sentiment: "Positive", outcome: "Counselling booked" },
];

const LEADS = [
  { id: "l1", name: "Priya Nair", phone: "+91 98290 11234", email: "priya.nair@gmail.com", req: "JEE 2026 batch + scholarship", status: "Interested", agent: "Aarohi – Admissions", source: "Inbound call", value: 120000, time: "12m ago" },
  { id: "l2", name: "Arjun Mehta", phone: "+91 99876 55012", email: "arjun.m@outlook.com", req: "3BHK in Whitefield, ₹1.2Cr", status: "Booked", agent: "Rohan – Sales", source: "Inbound call", value: 12000000, time: "31m ago" },
  { id: "l3", name: "Sana Kapoor", phone: "+91 81234 99001", email: "sana.k@gmail.com", req: "NEET dropper batch", status: "Contacted", agent: "Aarohi – Admissions", source: "Web chat", value: 145000, time: "1h ago" },
  { id: "l4", name: "Ananya Iyer", phone: "+91 96500 21188", email: "ananya@copperspoon.in", req: "Anniversary dinner, 6 pax", status: "Booked", agent: "Saanvi – Bookings", source: "Inbound call", value: 8500, time: "Yesterday" },
  { id: "l5", name: "Rahul Verma", phone: "+91 88001 23456", email: "rahul.verma@gmail.com", req: "2BHK rental, budget ₹35k", status: "New", agent: "Rohan – Sales", source: "Inbound call", value: 420000, time: "Yesterday" },
  { id: "l6", name: "Ishita Bose", phone: "+91 73910 65432", email: "ishita.b@gmail.com", req: "Foundation class 10", status: "Interested", agent: "Aarohi – Admissions", source: "Inbound call", value: 78000, time: "Yesterday" },
  { id: "l7", name: "Dev Sharma", phone: "+91 70219 44520", email: "dev.s@gmail.com", req: "Order #4821 not delivered", status: "Not interested", agent: "Kabir – Support", source: "Inbound call", value: 0, time: "2d ago" },
];

const APPTS = [
  { id: "a1", name: "Priya Nair", purpose: "Admission counselling", date: "Jun 10", time: "11:30 AM", mode: "Online", agent: "Aarohi – Admissions", status: "Scheduled" },
  { id: "a2", name: "Arjun Mehta", purpose: "Site visit – Whitefield", date: "Jun 10", time: "04:00 PM", mode: "In-person", agent: "Rohan – Sales", status: "Confirmed" },
  { id: "a3", name: "Ishita Bose", purpose: "Foundation demo class", date: "Jun 11", time: "05:30 PM", mode: "Online", agent: "Aarohi – Admissions", status: "Scheduled" },
  { id: "a4", name: "Mohit Rana", purpose: "Loan eligibility callback", date: "Jun 11", time: "01:00 PM", mode: "Phone", agent: "Vihaan – Loans", status: "Pending" },
  { id: "a5", name: "Ananya Iyer", purpose: "Dinner reservation", date: "Jun 12", time: "08:30 PM", mode: "In-person", agent: "Saanvi – Bookings", status: "Confirmed" },
];

const FOLLOWUPS = [
  { id: "f1", lead: "Sana Kapoor", reason: "Share NEET dropper fee structure", due: "Today, 3:00 PM", status: "Pending", owner: "Aarohi" },
  { id: "f2", lead: "Rahul Verma", reason: "Confirm budget & locality", due: "Today, 5:30 PM", status: "Pending", owner: "Rohan" },
  { id: "f3", lead: "Ishita Bose", reason: "Remind about demo class", due: "Tomorrow, 10:00 AM", status: "Scheduled", owner: "Aarohi" },
  { id: "f4", lead: "Mohit Rana", reason: "Loan callback", due: "Jun 11, 1:00 PM", status: "Scheduled", owner: "Vihaan" },
  { id: "f5", lead: "Karan Singh", reason: "Re-engage cold lead", due: "Overdue · Jun 7", status: "Overdue", owner: "Rohan" },
];

const OUTREACH = [
  { id: "o1", subject: "JEE 2026 — last 12 seats + scholarship", segment: "Class 12 inquiries", recipients: 480, opened: 71, replied: 22, status: "Completed", date: "Jun 7" },
  { id: "o2", subject: "Whitefield 3BHK — exclusive preview", segment: "Real estate leads", recipients: 210, opened: 64, replied: 18, status: "Completed", date: "Jun 5" },
  { id: "o3", subject: "We saved your table — confirm?", segment: "Lapsed diners", recipients: 92, opened: 58, replied: 31, status: "Sending", date: "Jun 9" },
  { id: "o4", subject: "Foundation batch demo this weekend", segment: "Class 9–10", recipients: 340, opened: 0, replied: 0, status: "Draft", date: "—" },
];

const INBOX = [
  { id: "i1", from: "Priya Nair", email: "priya.nair@gmail.com", subject: "Re: JEE 2026 scholarship", preview: "Thank you! Can I get the test syllabus and the exact date for the scholarship test?", time: "9:41 AM", unread: true, label: "Lead" },
  { id: "i2", from: "Arjun Mehta", email: "arjun.m@outlook.com", subject: "Re: Whitefield 3BHK preview", preview: "Looks great. Is Saturday 4pm still open for the site visit?", time: "9:02 AM", unread: true, label: "Hot" },
  { id: "i3", from: "Zomato Partner", email: "partners@zomato.com", subject: "Your weekly performance", preview: "The Copper Spoon received 38 reservation requests this week…", time: "Yesterday", unread: false, label: "Update" },
  { id: "i4", from: "Ishita Bose", email: "ishita.b@gmail.com", subject: "Demo class timing", preview: "Is the demo recorded? I might be 10 minutes late.", time: "Yesterday", unread: false, label: "Lead" },
  { id: "i5", from: "TrustFin Ops", email: "ops@trustfin.in", subject: "KYC documents pending", preview: "Please remind the customer to upload PAN and address proof.", time: "Jun 7", unread: false, label: "Internal" },
];

const THREADS = [
  { id: "m1", name: "Priya Nair", channel: "WhatsApp", last: "Sounds perfect, I'll join the 11:30 call 🙏", time: "9:44 AM", unread: 0, you: false },
  { id: "m2", name: "Arjun Mehta", channel: "WhatsApp", last: "You: Sharing the location pin now.", time: "9:05 AM", unread: 0, you: true },
  { id: "m3", name: "Sana Kapoor", channel: "SMS", last: "What's the last date to apply?", time: "8:50 AM", unread: 2, you: false },
  { id: "m4", name: "Ananya Iyer", channel: "WhatsApp", last: "You: Table for 6 confirmed at 8:30 ✅", time: "Yesterday", unread: 0, you: true },
  { id: "m5", name: "Rahul Verma", channel: "WhatsApp", last: "Can you send 2BHK options under 35k?", time: "Yesterday", unread: 1, you: false },
];

const TEMPLATES = [
  { id: "t1", name: "Coaching Inquiry Agent", category: "Education", desc: "Course info, batch timing, fee inquiry & admission callback.", uses: 1240, icon: "cap" },
  { id: "t2", name: "Real Estate Lead Agent", category: "Real Estate", desc: "Qualify buyers/renters and schedule property visits.", uses: 980, icon: "building" },
  { id: "t3", name: "Clinic Reception Agent", category: "Healthcare", desc: "Appointment requests & basic clinic information.", uses: 1510, icon: "plusCircle" },
  { id: "t4", name: "Restaurant Booking Agent", category: "Restaurant", desc: "Table reservations, menu & takeaway support.", uses: 760, icon: "calendar" },
  { id: "t5", name: "Bank Loan Agent", category: "Banking", desc: "Loan eligibility, document checklist & callbacks.", uses: 640, icon: "wallet" },
  { id: "t6", name: "Customer Support Agent", category: "Support", desc: "FAQ support, issue logging & follow-up.", uses: 1120, icon: "headphones" },
  { id: "t7", name: "Bus Ticket Booking Agent", category: "Travel", desc: "Routes, fares, availability & boarding support.", uses: 410, icon: "mapPin" },
  { id: "t8", name: "Salon Booking Agent", category: "Beauty", desc: "Service booking, stylist & timing capture.", uses: 350, icon: "sparkle" },
];

const FINDER = [
  { id: "fb1", business: "Apex Tutorials", category: "Coaching Center", location: "Kota, Rajasthan", phone: "+91 74400 22100", rating: 4.6, contacted: false },
  { id: "fb2", business: "BrightPath Academy", category: "Coaching Center", location: "Indore, MP", phone: "+91 73100 88210", rating: 4.4, contacted: true },
  { id: "fb3", business: "Sunrise Realtors", category: "Real Estate", location: "Pune, MH", phone: "+91 90210 41200", rating: 4.2, contacted: false },
  { id: "fb4", business: "Wellness Dental", category: "Healthcare", location: "Bengaluru, KA", phone: "+91 80450 11900", rating: 4.8, contacted: false },
  { id: "fb5", business: "Spice Route Bistro", category: "Restaurant", location: "Goa", phone: "+91 83200 55410", rating: 4.5, contacted: true },
];

const KB = [
  { id: "k1", name: "Course & Fee Structure 2026.pdf", type: "PDF", size: "1.2 MB", chunks: 84, updated: "Jun 6", status: "Indexed" },
  { id: "k2", name: "Scholarship (SCALE) Policy.docx", type: "DOCX", size: "320 KB", chunks: 28, updated: "Jun 4", status: "Indexed" },
  { id: "k3", name: "Admission FAQ.md", type: "MD", size: "44 KB", chunks: 16, updated: "Jun 2", status: "Indexed" },
  { id: "k4", name: "Hostel & Transport Info.pdf", type: "PDF", size: "680 KB", chunks: 0, updated: "Just now", status: "Processing" },
];

const INVOICES = [
  { id: "INV-2026-061", date: "Jun 01, 2026", amount: "₹18,400", status: "Paid", plan: "Growth" },
  { id: "INV-2026-051", date: "May 01, 2026", amount: "₹18,400", status: "Paid", plan: "Growth" },
  { id: "INV-2026-041", date: "Apr 01, 2026", amount: "₹9,900", status: "Paid", plan: "Starter" },
  { id: "INV-2026-031", date: "Mar 01, 2026", amount: "₹9,900", status: "Paid", plan: "Starter" },
];

const ADMIN_ORGS = [
  { id: "or1", name: "Vidya Coaching Center", plan: "Growth", users: 8, agents: 3, mrr: "₹18,400", status: "Active" },
  { id: "or2", name: "Nexa Realty", plan: "Scale", users: 14, agents: 6, mrr: "₹42,000", status: "Active" },
  { id: "or3", name: "Smile Dental Clinic", plan: "Starter", users: 3, agents: 1, mrr: "₹9,900", status: "Trial" },
  { id: "or4", name: "FloMart D2C", plan: "Scale", users: 22, agents: 9, mrr: "₹42,000", status: "Active" },
  { id: "or5", name: "The Copper Spoon", plan: "Starter", users: 2, agents: 1, mrr: "₹9,900", status: "Past due" },
];

const VOICES = [
  { id: "v1", name: "Aarohi", trait: "Warm · Female", lang: "Hindi / Hinglish", pop: true },
  { id: "v2", name: "Rohan", trait: "Confident · Male", lang: "English", pop: true },
  { id: "v3", name: "Meera", trait: "Polite · Female", lang: "Hindi + English", pop: false },
  { id: "v4", name: "Kabir", trait: "Expert · Male", lang: "English", pop: false },
  { id: "v5", name: "Saanvi", trait: "Friendly · Female", lang: "English", pop: true },
  { id: "v6", name: "Vihaan", trait: "Calm · Male", lang: "Hinglish", pop: false },
];

const CALL_VOLUME = [28, 44, 36, 62, 48, 74, 58, 86, 69, 92, 78, 96, 71, 88];
const MINUTES_TREND = [120, 180, 150, 240, 210, 300, 280];

const USER = { name: "Rishi Malhotra", email: "rishi@vidyacoaching.in", org: "Vidya Coaching Center", plan: "Growth", role: "admin" };

Object.assign(window, {
  AGENTS, CALLS, LEADS, APPTS, FOLLOWUPS, OUTREACH, INBOX, THREADS, TEMPLATES, FINDER, KB, INVOICES, ADMIN_ORGS, VOICES, CALL_VOLUME, MINUTES_TREND, USER,
});
