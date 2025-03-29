import { EvaluationType, EvaluationMetric, EvaluationV2, EvaluationResultValue, EVALUATION_SCORE_SCALE } from '@latitude-data/constants';
import { Database, database } from '../../client';
import { publisher } from '../../events';
import { buildConversation, formatMessage } from '../../helpers';
import { Result, BadRequestError, UnprocessableEntityError } from '../../lib';
import { DocumentVersionsRepository, DocumentLogsRepository } from '../../repositories';
import { ProviderLog, DatasetV2, DatasetRow, Commit, Workspace } from '../../schema';
import { getColumnData } from '../datasetsV2';
import { serializeProviderLog } from '../providerLogs';
import { createEvaluationResultV2 } from './run';
import { EVALUATION_V2_SPECIFICATIONS } from './shared';
import { Transaction } from '../../lib/Transaction';


export async function runEvaluationV2<
    T extends EvaluationType,
    M extends EvaluationMetric<T>
>(
    {
        evaluation, providerLog, dataset, datasetLabel, datasetRow, commit, workspace,
    }: {
        evaluation: EvaluationV2<T, M>;
        providerLog: ProviderLog;
        dataset?: DatasetV2;
        datasetLabel?: string;
        datasetRow?: DatasetRow;
        commit: Commit;
        workspace: Workspace;
    },
    db: Database = database
) {
    const documentsRepository = new DocumentVersionsRepository(workspace.id, db);
    const document = await documentsRepository
        .getDocumentAtCommit({
            commitUuid: commit.uuid,
            documentUuid: evaluation.documentUuid,
        })
        .then((r) => r.unwrap());

    if (!providerLog.documentLogUuid) {
        return Result.error(
            new BadRequestError('Provider log is not attached to a document log')
        );
    }

    const documentLogsRepository = new DocumentLogsRepository(workspace.id, db);
    const documentLog = await documentLogsRepository
        .findByUuid(providerLog.documentLogUuid)
        .then((r) => r.unwrap());

    if (documentLog.documentUuid !== document.documentUuid) {
        return Result.error(
            new UnprocessableEntityError(
                'Cannot evaluate a log that is from a different document'
            )
        );
    }

    const conversation = buildConversation(serializeProviderLog(providerLog));
    if (conversation.at(-1)?.role != 'assistant') {
        return Result.error(
            new UnprocessableEntityError(
                'Cannot evaluate a log that does not end with an assistant message'
            )
        );
    }

    const actualOutput = formatMessage(conversation.at(-1)!);

    const typeSpecification = EVALUATION_V2_SPECIFICATIONS[evaluation.type];
    if (!typeSpecification) {
        return Result.error(new BadRequestError('Invalid evaluation type'));
    }

    const metricSpecification = typeSpecification.metrics[evaluation.metric];
    if (!metricSpecification) {
        return Result.error(new BadRequestError('Invalid evaluation metric'));
    }

    let expectedOutput = undefined;
    if (metricSpecification.requiresExpectedOutput) {
        if (!dataset || !datasetLabel || !datasetRow) {
            throw new BadRequestError('Dataset, label and row are required');
        }

        if (datasetRow.datasetId !== dataset.id) {
            return Result.error(new BadRequestError('Row is not part of the dataset'));
        }

        expectedOutput = getColumnData({
            dataset: dataset,
            row: datasetRow,
            column: datasetLabel,
        });
    }

    let value;
    try {
        value = (await typeSpecification.run(
            {
                metric: evaluation.metric,
                evaluation: evaluation,
                actualOutput: actualOutput,
                expectedOutput: expectedOutput,
                conversation: conversation,
                providerLog: providerLog,
                documentLog: documentLog,
                document: document,
                dataset: dataset,
                datasetLabel: datasetLabel,
                datasetRow: datasetRow,
                commit: commit,
                workspace: workspace,
            },
            db
        )) as EvaluationResultValue; // Note: Typescript cannot resolve conditional types including unbound type arguments: https://github.com/microsoft/TypeScript/issues/53455

        if (!value.error &&
            (value.normalizedScore < 0 ||
                value.normalizedScore > EVALUATION_SCORE_SCALE)) {
            throw new UnprocessableEntityError(
                `Normalized metric score must be between 0 and ${EVALUATION_SCORE_SCALE}`
            );
        }
    } catch (error) {
        value = { error: { message: (error as Error).message } };
    }

    return await Transaction.call(async (tx) => {
        const { result } = await createEvaluationResultV2(
            {
                evaluation: evaluation,
                providerLog: providerLog,
                commit: commit,
                value: value as EvaluationResultValue<T, M>,
                workspace: workspace,
            },
            tx
        ).then((r) => r.unwrap());

        await publisher.publishLater({
            type: 'evaluationV2Ran',
            data: {
                workspaceId: workspace.id,
                evaluation: evaluation,
                commit: commit,
                providerLog: providerLog,
            },
        });

        return Result.ok({ result });
    }, db);
}

