import { describe, it, expect } from "vitest";
import { hasLocation, locationLine, directionsUrl } from "@/lib/events/location";

describe("hasLocation", () => {
  it("is false when nothing is set", () => {
    expect(hasLocation({})).toBe(false);
  });
  it("is true with a venue, an address, or coordinates", () => {
    expect(hasLocation({ venueName: "Hall A" })).toBe(true);
    expect(hasLocation({ address: "1 Main St" })).toBe(true);
    expect(hasLocation({ latitude: 33.9, longitude: 35.5 })).toBe(true);
  });
  it("needs BOTH coordinates", () => {
    expect(hasLocation({ latitude: 33.9 })).toBe(false);
  });
});

describe("locationLine", () => {
  it("joins only the present parts", () => {
    expect(locationLine({ venueName: "Hall A", city: "Beirut", country: "LB" })).toBe("Hall A, Beirut, LB");
    expect(locationLine({})).toBe("");
  });
});

describe("directionsUrl", () => {
  it("prefers an explicit map URL", () => {
    expect(directionsUrl({ mapUrl: "https://maps.example/x", latitude: 1, longitude: 2 })).toBe("https://maps.example/x");
  });
  it("falls back to coordinates", () => {
    expect(directionsUrl({ latitude: 33.9, longitude: 35.5 })).toBe(
      "https://www.google.com/maps/dir/?api=1&destination=33.9,35.5",
    );
  });
  it("falls back to an address search", () => {
    expect(directionsUrl({ venueName: "Hall A", city: "Beirut" })).toBe(
      "https://www.google.com/maps/search/?api=1&query=Hall%20A%2C%20Beirut",
    );
  });
  it("returns null when there is nothing to point at", () => {
    expect(directionsUrl({})).toBeNull();
  });
});
