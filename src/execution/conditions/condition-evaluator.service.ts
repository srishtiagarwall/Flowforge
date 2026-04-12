import { BadRequestException, Injectable } from '@nestjs/common';

type ComparisonOperator = '==' | '!=' | '>=' | '<=' | '>' | '<';
type LogicalOperator = '&&' | '||';

@Injectable()
export class ConditionEvaluatorService {
  validate(condition: string): void {
    const normalized = this.normalize(condition);
    this.parseLogicalExpression(normalized);
  }

  evaluate(condition: string, scope: Record<string, unknown>): boolean {
    const normalized = this.normalize(condition);
    const tokens = this.parseLogicalExpression(normalized);

    let result = this.evaluateComparison(tokens[0], scope);
    for (let index = 1; index < tokens.length; index += 2) {
      const operator = tokens[index] as LogicalOperator;
      const next = this.evaluateComparison(tokens[index + 1], scope);
      result = operator === '&&' ? result && next : result || next;
    }

    return result;
  }

  private normalize(condition: string): string {
    const normalized = condition.trim();
    if (!normalized) {
      throw new BadRequestException('Condition expressions cannot be empty');
    }
    if (/[();{}[\]]/.test(normalized)) {
      throw new BadRequestException(
        `Unsupported tokens in condition "${condition}"`,
      );
    }
    return normalized;
  }

  private parseLogicalExpression(condition: string): string[] {
    const segments = condition.split(/(\&\&|\|\|)/).map((part) => part.trim());
    const filtered = segments.filter((part) => part.length > 0);

    if (filtered.length % 2 === 0) {
      throw new BadRequestException(
        `Invalid condition syntax "${condition}"`,
      );
    }

    for (let index = 0; index < filtered.length; index += 2) {
      this.parseComparison(filtered[index]);
    }

    for (let index = 1; index < filtered.length; index += 2) {
      if (filtered[index] !== '&&' && filtered[index] !== '||') {
        throw new BadRequestException(
          `Unsupported logical operator "${filtered[index]}" in "${condition}"`,
        );
      }
    }

    return filtered;
  }

  private evaluateComparison(
    comparison: string,
    scope: Record<string, unknown>,
  ): boolean {
    const parsed = this.parseComparison(comparison);
    const left = this.resolveOperand(parsed.left, scope);
    const right = this.resolveOperand(parsed.right, scope);

    switch (parsed.operator) {
      case '==':
        return left === right;
      case '!=':
        return left !== right;
      case '>=':
        return this.toNumber(left) >= this.toNumber(right);
      case '<=':
        return this.toNumber(left) <= this.toNumber(right);
      case '>':
        return this.toNumber(left) > this.toNumber(right);
      case '<':
        return this.toNumber(left) < this.toNumber(right);
    }
  }

  private parseComparison(comparison: string): {
    left: string;
    operator: ComparisonOperator;
    right: string;
  } {
    const match = comparison.match(
      /^(?<left>[A-Za-z_][\w.]*)\s*(?<operator>==|!=|>=|<=|>|<)\s*(?<right>.+)$/,
    );

    if (!match?.groups) {
      throw new BadRequestException(
        `Unsupported condition clause "${comparison}"`,
      );
    }

    return {
      left: match.groups.left.trim(),
      operator: match.groups.operator as ComparisonOperator,
      right: match.groups.right.trim(),
    };
  }

  private resolveOperand(
    raw: string,
    scope: Record<string, unknown>,
  ): unknown {
    if ((raw.startsWith('"') && raw.endsWith('"')) || (raw.startsWith("'") && raw.endsWith("'"))) {
      return raw.slice(1, -1);
    }
    if (raw === 'true') return true;
    if (raw === 'false') return false;
    if (raw === 'null') return null;
    if (/^-?\d+(\.\d+)?$/.test(raw)) {
      return Number(raw);
    }
    return this.resolvePath(raw, scope);
  }

  private resolvePath(path: string, scope: Record<string, unknown>): unknown {
    const parts = path.split('.');
    let current: unknown = scope;

    for (const part of parts) {
      if (current === null || current === undefined) {
        return undefined;
      }
      current = (current as Record<string, unknown>)[part];
    }

    return current;
  }

  private toNumber(value: unknown): number {
    if (typeof value === 'number') {
      return value;
    }

    if (typeof value === 'string' && /^-?\d+(\.\d+)?$/.test(value)) {
      return Number(value);
    }

    throw new BadRequestException(
      `Expected numeric operand in condition evaluation, received "${String(value)}"`,
    );
  }
}
