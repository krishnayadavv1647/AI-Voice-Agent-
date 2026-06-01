import { ApiError } from "../utils/apiError.js";
import { ExotelTelephony } from "./exotel.telephony.js";
import { TwilioTelephony } from "./twilio.telephony.js";
import { VonageTelephony } from "./vonage.telephony.js";

export function getTelephonyProvider(provider) {
  switch (provider) {
    case "twilio":
      return TwilioTelephony;
    case "exotel":
      return ExotelTelephony;
    case "vonage":
      return VonageTelephony;
    default:
      throw new ApiError(400, `Telephony provider missing or unsupported: ${provider}`);
  }
}
