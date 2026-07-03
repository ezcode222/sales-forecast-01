import { sendForecastChangeEmails } from './overplanNotification';
import { loadOverplanRegistrationMeta } from './overplanData';

type ForecastChangeInput = {
  changedBy: string;
  commitBatchId?: string;
  changes: Array<{
    registrationId: string;
    periodKey: string;
    oldQtyFcst: number | null;
    newQtyFcst: number;
  }>;
};

export function queueForecastChangeNotification(input: ForecastChangeInput) {
  if (process.env.FORECAST_EMAIL_ENABLED !== 'true' || input.changes.length === 0) {
    return;
  }

  void (async () => {
    try {
      const registrationIds = [...new Set(input.changes.map(change => change.registrationId))];
      const metaById = await loadOverplanRegistrationMeta(registrationIds);
      await sendForecastChangeEmails({
        changedBy: input.changedBy,
        commitBatchId: input.commitBatchId,
        changes: input.changes.map(change => {
          const meta = metaById.get(change.registrationId);
          return {
            registrationId: change.registrationId,
            ownerName: meta?.ownerName ?? '',
            materialCode: meta?.materialCode ?? '',
            materialDescription: meta?.materialDescription ?? '',
            plantCode: meta?.plantCode ?? '',
            period: change.periodKey,
            oldQtyFcst: change.oldQtyFcst,
            newQtyFcst: change.newQtyFcst,
          };
        }),
      });
    } catch (error) {
      console.error('[forecast-change-notification] failed:', error);
    }
  })();
}
