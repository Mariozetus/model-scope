import { describe, expect, it } from "vitest";
import { cohortConfidence } from "@/lib/scoring/anchors";
import { percentileToScore, scoreByCohort } from "@/lib/scoring/cohort";
import { aggregateQualityIndex, aggregateSkillProfile } from "@/lib/scoring/skills";
import { classifySpeed } from "@/lib/scoring/speed";
import type { SkillProfile } from "@/lib/domain/types";

describe("percentileToScore", () => {
  it("mapea los puntos de control de la curva", () => {
    expect(percentileToScore(0)).toBeCloseTo(1.0);
    expect(percentileToScore(0.5)).toBeCloseTo(5.0);
    expect(percentileToScore(1)).toBeCloseTo(10.0);
  });

  it("es monótona y acotada", () => {
    let previous = -Infinity;
    for (let p = 0; p <= 1.0001; p += 0.01) {
      const score = percentileToScore(p);
      expect(score).toBeGreaterThanOrEqual(previous);
      expect(score).toBeGreaterThanOrEqual(1);
      expect(score).toBeLessThanOrEqual(10);
      previous = score;
    }
  });
});

describe("scoreByCohort", () => {
  // Una cohorte de 30+ no sufre contracción de confianza, así que el líder
  // sí puede recibir el 10 (si el benchmark no define un techo < 10).

  it("el mejor de una cohorte grande se lleva el 10 y el peor el 1", () => {
    // "arena-multilingual" tiene techo 9.0; usamos un benchmark sin techo
    // definido para comprobar el extremo de la escala.
    const many = Array.from({ length: 30 }, (_, i) => ({
      modelId: `m${i}`,
      rawScore: i === 0 ? 10 : i === 29 ? 90 : 40 + i,
    }));

    const { scores } = scoreByCohort(many, "test-benchmark");
    expect(scores.get("m29")).toBe(10);
    expect(scores.get("m0")).toBe(1);

    // Y con 3 elementos la posición relativa se mantiene.
    const small = scoreByCohort(
      [
        { modelId: "a", rawScore: 10 },
        { modelId: "b", rawScore: 50 },
        { modelId: "c", rawScore: 90 },
      ],
      "test-benchmark",
    );
    expect(small.scores.get("c")!).toBeGreaterThan(small.scores.get("b")!);
    expect(small.scores.get("b")!).toBeGreaterThan(small.scores.get("a")!);
  });

  it("NO recalibra cuando entra un modelo mejor: el líder cambia, los demás no", () => {
    const base = Array.from({ length: 30 }, (_, i) => ({
      modelId: `m${i}`,
      rawScore: 40 + i,
    }));

    const before = scoreByCohort(base, "test-benchmark");

    // Llega un modelo nuevo y mejor.
    const after = scoreByCohort(
      [...base, { modelId: "new", rawScore: 95 }],
      "test-benchmark",
    );

    // El 10 se traspasa al nuevo líder.
    expect(after.scores.get("new")).toBe(10);
    expect(before.scores.get("m29")).toBe(10);
    // El antiguo líder baja: el cambio es merecido, no artificial.
    expect(after.scores.get("m29")!).toBeLessThan(before.scores.get("m29")!);
    // Y el resto conserva su orden relativo.
    expect(after.scores.get("m0")!).toBeLessThan(after.scores.get("m1")!);
    // Los modelos del final apenas se mueven: la escala no se recalibra.
    expect(Math.abs(after.scores.get("m0")! - before.scores.get("m0")!)).toBeLessThan(
      1.5,
    );
  });

  it("acota por el techo de capacidad del benchmark (sin outliers con 10)", () => {
    const many = Array.from({ length: 30 }, (_, i) => ({
      modelId: `m${i}`,
      rawScore: 10 + i,
    }));
    const { scores } = scoreByCohort(many, "swe-bench-verified"); // techo 9.0
    expect(scores.get("m29")).toBeLessThanOrEqual(9);
  });

  it("contrae hacia la mediana cuando la cohorte es pequeña", () => {
    const { scores, confidence } = scoreByCohort(
      [
        { modelId: "a", rawScore: 10 },
        { modelId: "b", rawScore: 90 },
      ],
      "gpqa-diamond",
    );
    expect(confidence).toBeLessThan(1);
    // Con n=2 la separación se reduce: el segundo no llega a 10.
    expect(scores.get("b")!).toBeLessThan(10);
  });

  it("gestiona empates con mid-rank", () => {
    const { scores, percentiles } = scoreByCohort(
      [
        { modelId: "a", rawScore: 50 },
        { modelId: "b", rawScore: 50 },
        { modelId: "c", rawScore: 90 },
      ],
      "gpqa-diamond",
    );
    expect(scores.get("a")).toBe(scores.get("b"));
    expect(percentiles.get("a")).toBe(percentiles.get("b"));
  });

  it("devuelve 5.0 (neutro) con un único dato", () => {
    const { scores } = scoreByCohort([{ modelId: "solo", rawScore: 99 }], "x");
    expect(scores.get("solo")).toBe(5);
  });
});

describe("cohortConfidence", () => {
  it("es 1.0 con cohortes grandes y se reduce con cohortes pequeñas", () => {
    expect(cohortConfidence(50)).toBe(1);
    expect(cohortConfidence(30)).toBe(1);
    expect(cohortConfidence(3)).toBeLessThan(1);
    expect(cohortConfidence(2)).toBeLessThanOrEqual(cohortConfidence(3));
  });

  it("es monótona creciente en el tamaño de la cohorte", () => {
    for (let n = 2; n < 30; n++) {
      expect(cohortConfidence(n + 1)).toBeGreaterThanOrEqual(
        cohortConfidence(n),
      );
    }
  });
});

describe("aggregateSkillProfile", () => {
  it("devuelve 5.0 neutro cuando no hay datos", () => {
    const profile = aggregateSkillProfile(new Map());
    expect(profile.code).toBe(5);
    expect(profile.reasoning).toBe(5);
  });

  it("agrega los componentes ponderados de cada habilidad", () => {
    const normalized = new Map([
      ["swe-bench-verified", 8],
      ["livecodebench", 6],
    ]);
    const profile = aggregateSkillProfile(normalized);
    // 8*0.6 + 6*0.4 = 7.2
    expect(profile.code).toBeCloseTo(7.2, 1);
  });

  it("el índice agregado está acotado a 0..100", () => {
    const max: SkillProfile = {
      code: 10,
      reasoning: 10,
      writing: 10,
      languages: 10,
      "data-analysis": 10,
      "long-context": 10,
    };
    const min: SkillProfile = {
      code: 1,
      reasoning: 1,
      writing: 1,
      languages: 1,
      "data-analysis": 1,
      "long-context": 1,
    };
    expect(aggregateQualityIndex(max)).toBe(100);
    expect(aggregateQualityIndex(min)).toBe(10);
  });
});

describe("classifySpeed", () => {
  it("clasifica por tokens por segundo", () => {
    expect(classifySpeed(200, 0.2).label).toBe("instantaneo");
    expect(classifySpeed(80, 0.5).label).toBe("rapido");
    expect(classifySpeed(40, 0.8).label).toBe("medio");
  });

  it("el TTFT alto domina: un modelo 'thinking' es reflexivo aunque sea rápido", () => {
    expect(classifySpeed(300, 4).label).toBe("reflexivo");
  });

  it("sin datos devuelve velocidad desconocida", () => {
    expect(classifySpeed(null, null).labelEs).toBe("Velocidad desconocida");
  });
});
