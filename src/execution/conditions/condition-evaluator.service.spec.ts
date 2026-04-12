import { ConditionEvaluatorService } from './condition-evaluator.service';

describe('ConditionEvaluatorService', () => {
  const service = new ConditionEvaluatorService();

  it('evaluates simple comparisons safely', () => {
    expect(service.evaluate('score >= 70', { score: 72 })).toBe(true);
    expect(service.evaluate('score < 70', { score: 72 })).toBe(false);
  });

  it('supports logical chaining', () => {
    expect(
      service.evaluate('score >= 70 && input.vip == true', {
        score: 88,
        input: { vip: true },
      }),
    ).toBe(true);
  });

  it('rejects unsafe syntax', () => {
    expect(() => service.validate('score >= 70; process.exit()')).toThrow();
  });
});
