import { DocumentTriggerType } from "@latitude-data/constants";
import { getNextRunTime } from "./cronHelper";
import { InsertScheduledTriggerConfiguration, EmailTriggerConfiguration, DocumentTriggerConfiguration } from "./schema";


export function buildConfiguration({
    triggerType, configuration,
}: {
    triggerType: DocumentTriggerType;
    configuration: InsertScheduledTriggerConfiguration | EmailTriggerConfiguration;
}): DocumentTriggerConfiguration {
    switch (triggerType) {
        case 'email':
            return configuration as EmailTriggerConfiguration;
        case 'scheduled':
            return {
                ...configuration,
                lastRun: new Date(),
                nextRunTime: getNextRunTime(
                    (configuration as InsertScheduledTriggerConfiguration).cronExpression
                ),
            } as ScheduledTriggerConfiguration;
        default:
            throw new LatitudeError('Invalid trigger type');
    }
}

