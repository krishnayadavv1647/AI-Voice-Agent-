export function generateTemplateDefaults(templateType = "") {
  const templates = {
    restaurant_booking: {
      businessCategory: "Restaurant",
      businessDescription: "A restaurant that takes table booking, menu inquiries, takeaway questions, and customer follow-ups.",
      services: "Table reservation, menu information, takeaway support, party booking inquiries.",
      pricing: "Pricing depends on menu items, offers, and booking requirements. Confirm exact pricing with the team.",
      faqs: "Ask for number of guests, date, time, name, phone number, and special requests.",
      policies: "Bookings are subject to table availability. The team confirms special requests.",
      offers: "Mention current offers only if the business has provided them.",
      additionalInfo: "Keep calls short and collect booking details clearly.",
      mainGoal: "Help callers request table bookings and capture booking details.",
      secondaryGoal: "Collect name, phone number, number of guests, preferred date, preferred time, and special request."
    },
    clinic_reception: {
      businessCategory: "Clinic",
      businessDescription: "A clinic reception assistant for appointment inquiries and basic clinic information.",
      services: "Appointment requests, doctor availability questions, clinic timing, callback requests.",
      pricing: "Consultation fees vary by doctor or service. Team will confirm exact fees.",
      faqs: "Ask for patient name, phone number, concern, preferred date, and preferred time.",
      policies: "Do not diagnose, prescribe medicines, or interpret reports.",
      offers: "",
      additionalInfo: "For emergencies, ask caller to visit the hospital or contact emergency services.",
      mainGoal: "Capture appointment requests and answer clinic information questions.",
      secondaryGoal: "Collect patient name, phone number, requirement, preferred date, and preferred time."
    },
    bus_ticket_booking: {
      businessCategory: "Bus Ticket Booking",
      businessDescription: "A travel booking assistant for bus route, ticket, fare, and availability inquiries.",
      services: "Bus ticket booking requests, route inquiry, fare estimate, boarding and dropping point support.",
      pricing: "Fare depends on route, date, bus type, operator, and seat availability.",
      faqs: "Ask source city, destination city, travel date, passengers, bus type, and timing.",
      policies: "Do not confirm tickets unless booking confirmation and payment are complete.",
      offers: "",
      additionalInfo: "Say booking request unless confirmation/payment is complete.",
      mainGoal: "Capture bus ticket booking requests.",
      secondaryGoal: "Collect route, date, passengers, bus type, name, and phone number."
    }
  };

  return templates[templateType] || {};
}
