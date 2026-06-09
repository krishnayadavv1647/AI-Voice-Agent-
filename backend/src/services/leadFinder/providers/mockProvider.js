function slug(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

function phoneFor(index) {
  return `+91${String(8000000000 + index * 137).slice(0, 10)}`;
}

export async function searchLeads({ category, keyword, city, country, totalRequested }) {
  const total = Math.max(1, Math.min(Number(totalRequested) || 25, 100));
  const cleanCategory = category || "Business";
  const cleanKeyword = keyword || cleanCategory;
  const cleanCity = city || "City";
  const cleanCountry = country || "India";
  const leadTypes = ["Hub", "Academy", "Solutions", "Center", "Services", "Group", "Institute", "Studio"];

  return Array.from({ length: total }, (_, index) => {
    const suffix = leadTypes[index % leadTypes.length];
    const businessName = `${cleanCity} ${cleanKeyword} ${suffix} ${index + 1}`;
    const websiteSlug = slug(businessName);

    return {
      businessName,
      contactName: "",
      phone: phoneFor(index + 1),
      email: `info@${websiteSlug || `lead-${index + 1}`}.example.com`,
      website: `https://${websiteSlug || `lead-${index + 1}`}.example.com`,
      city: cleanCity,
      address: `${index + 11}, Main Road, ${cleanCity}`,
      country: cleanCountry,
      category: cleanCategory,
      industry: cleanCategory,
      googleMapsUrl: `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${businessName} ${cleanCity}`)}`,
      instagramUrl: "",
      facebookUrl: "",
      linkedinUrl: "",
      source: "mock"
    };
  });
}
