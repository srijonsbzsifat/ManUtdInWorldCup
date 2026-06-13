import { describe, it, expect } from "vitest";
import { matchUnitedPlayer } from "@/lib/players";

describe("matchUnitedPlayer", () => {
  it("matches exact name", () => {
    expect(matchUnitedPlayer("Bruno Fernandes")?.id).toBe("bruno");
    expect(matchUnitedPlayer("Casemiro")?.id).toBe("casemiro");
    expect(matchUnitedPlayer("Diogo Dalot")?.id).toBe("dalot");
  });

  it("matches known aliases", () => {
    expect(matchUnitedPlayer("Bruno Miguel Borges Fernandes")?.id).toBe("bruno");
    expect(matchUnitedPlayer("Manuel Ugarte Ribeiro")?.id).toBe("ugarte");
    expect(matchUnitedPlayer("Amad Traore")?.id).toBe("amad");
    expect(matchUnitedPlayer("Amad Diallo Traore")?.id).toBe("amad");
    expect(matchUnitedPlayer("Matheus Santos Carneiro da Cunha")?.id).toBe("cunha");
    expect(matchUnitedPlayer("Senne Lammens")?.id).toBe("lammens");
  });

  it("matches names with diacritics", () => {
    expect(matchUnitedPlayer("Lisandro Martínez")?.id).toBe("martinez");
    expect(matchUnitedPlayer("Noussaïr Mazraoui")?.id).toBe("mazraoui");
  });

  it("matches by last name token when unambiguous", () => {
    expect(matchUnitedPlayer("Ugarte")?.id).toBe("ugarte");
    expect(matchUnitedPlayer("Dalot")?.id).toBe("dalot");
  });

  it("returns undefined for unknown player", () => {
    expect(matchUnitedPlayer("Cristiano Ronaldo")).toBeUndefined();
    expect(matchUnitedPlayer("John Smith")).toBeUndefined();
    expect(matchUnitedPlayer("")).toBeUndefined();
  });
});
