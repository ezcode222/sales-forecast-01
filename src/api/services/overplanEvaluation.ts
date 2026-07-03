export type OverplanBreachStatus = 'over' | 'under' | 'ok';

export type OverplanConfigThresholds = {
  aboveEnabled: boolean;
  belowEnabled: boolean;
  aboveThresholdTon: number | null;
  aboveThresholdPercent: number | null;
  belowThresholdTon: number | null;
  belowThresholdPercent: number | null;
};

export type OverplanResultRow = {
  materialCode: string;
  materialDescription: string;
  plantCode: string;
  period: string;
  leftQty: number;
  rightQty: number;
  diffQty: number;
  pctVsRight: number | null;
  status: OverplanBreachStatus;
  breachReasons: string[];
  ownerName?: string;
  registrationId?: string;
};

export type OverplanQtyRow = {
  leftQty: number;
  rightQty: number;
};

export type OverplanEvaluatedRow = OverplanQtyRow & {
  diffQty: number;
  pctVsRight: number | null;
  status: OverplanBreachStatus;
  breachReasons: string[];
};

function pctOf(left: number, right: number): number | null {
  if (right === 0) return null;
  return (left / right) * 100;
}

function checkDirectionBreach(
  diff: number,
  pct: number | null,
  config: OverplanConfigThresholds,
  direction: 'above' | 'below'
): { breached: boolean; reasons: string[] } {
  const enabled = direction === 'above' ? config.aboveEnabled : config.belowEnabled;
  if (!enabled) return { breached: false, reasons: [] };

  const tonThreshold = direction === 'above' ? config.aboveThresholdTon : config.belowThresholdTon;
  const pctThreshold = direction === 'above' ? config.aboveThresholdPercent : config.belowThresholdPercent;
  const reasons: string[] = [];
  let breached = false;

  if (tonThreshold !== null && Number.isFinite(tonThreshold)) {
    const tonHit = direction === 'above' ? diff > tonThreshold : diff < -tonThreshold;
    if (tonHit) {
      breached = true;
      reasons.push(
        direction === 'above'
          ? `Exceeded above ton threshold (${diff.toFixed(3)} > ${tonThreshold})`
          : `Exceeded below ton threshold (${diff.toFixed(3)} < -${tonThreshold})`
      );
    }
  }

  if (pct !== null && pctThreshold !== null && Number.isFinite(pctThreshold)) {
    const pctHit = direction === 'above'
      ? pct > 100 + pctThreshold
      : pct < 100 - pctThreshold;
    if (pctHit) {
      breached = true;
      reasons.push(
        direction === 'above'
          ? `Exceeded above percent threshold (${pct.toFixed(2)}% > ${(100 + pctThreshold).toFixed(2)}%)`
          : `Exceeded below percent threshold (${pct.toFixed(2)}% < ${(100 - pctThreshold).toFixed(2)}%)`
      );
    }
  }

  return { breached, reasons };
}

export function evaluateOverplanRow(
  row: OverplanQtyRow,
  config: OverplanConfigThresholds,
  compareLabel: string
): OverplanEvaluatedRow {
  const diffQty = row.leftQty - row.rightQty;
  const pctVsRight = pctOf(row.leftQty, row.rightQty);
  const above = checkDirectionBreach(diffQty, pctVsRight, config, 'above');
  const below = checkDirectionBreach(diffQty, pctVsRight, config, 'below');

  if (above.breached) {
    return {
      ...row,
      diffQty,
      pctVsRight,
      status: 'over',
      breachReasons: above.reasons.map(reason => `${compareLabel}: ${reason}`),
    };
  }
  if (below.breached) {
    return {
      ...row,
      diffQty,
      pctVsRight,
      status: 'under',
      breachReasons: below.reasons.map(reason => `${compareLabel}: ${reason}`),
    };
  }

  return {
    ...row,
    diffQty,
    pctVsRight,
    status: 'ok',
    breachReasons: [],
  };
}
