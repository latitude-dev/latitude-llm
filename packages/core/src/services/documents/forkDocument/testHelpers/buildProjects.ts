import { Providers } from '../../../../constants'
import * as factories from '../../../../tests/factories'

export async function buildProjects() {
  const { workspace, user, documents, project, commit } =
    await factories.createProject({
      providers: [
        { name: 'openai', type: Providers.OpenAI },
        { name: 'myAnthropic', type: Providers.Anthropic },
      ],
      documents: {
        rootFile: factories.helpers.createPrompt({
          provider: 'myAnthropic',
          content: 'foo',
        }),
        siblingParent: {
          sibling: factories.helpers.createPrompt({
            provider: 'myAnthropic',
            content: 'Sibling Parent',
          }),
        },
        agents: {
          agent1: factories.helpers.createPrompt({
            provider: 'myAnthropic',
            content: 'Agent 1',
            extraConfig: { type: 'agent' },
          }),
          agent2: factories.helpers.createPrompt({
            provider: 'myAnthropic',
            content: 'Agent 2',
            extraConfig: { type: 'agent', agents: ['./subagent1'] },
          }),
          subagent1: factories.helpers.createPrompt({
            provider: 'myAnthropic',
            content: 'Subagent 1',
            extraConfig: { type: 'agent', agents: ['subagent2'] },
          }),
          subagent2: factories.helpers.createPrompt({
            provider: 'myAnthropic',
            content: 'Subagent 2',
            extraConfig: { type: 'agent' },
          }),
        },
        'some-folder': {
          parent: factories.helpers.createPrompt({
            provider: 'openai',
            model: 'gpt-3.5-turbo',
            content: `
            Parent:
            <prompt path="./children/child1" />
            <prompt path="../siblingParent/sibling" />
            <prompt path="./children/child2" />
          `,
          }),
          children: {
            child1: factories.helpers.createPrompt({
              provider: 'myAnthropic',
              extraConfig: {
                agents: ['/agents/agent1', '../../agents/agent2'],
              },
              content: `
            Child 1:
            <prompt path="./grandchildren/grandchild1" />
            <prompt path="./childSibling" />
          `,
            }),
            child2: factories.helpers.createPrompt({
              provider: 'myAnthropic',
              content: `
            Child 2:
            <prompt path="./grandchildren/grandchild2" />
            <prompt path="./childSibling" />
          `,
            }),
            childSibling: factories.helpers.createPrompt({
              provider: 'myAnthropic',
              content: `
            Link to grand grand child 2:
            <prompt path="./grandchildren/grandchild2" />
          `,
            }),
            grandchildren: {
              grandchild1: factories.helpers.createPrompt({
                provider: 'myAnthropic',
                content: `
            Grandchild 1:
            <prompt path="./grand-grand-grandChildren/deepestGrandChild" />
          `,
              }),
              grandchild2: factories.helpers.createPrompt({
                provider: 'myAnthropic',
                content: 'Grandchild 2',
              }),
              'grand-grand-grandChildren': {
                deepestGrandChild: factories.helpers.createPrompt({
                  provider: 'myAnthropic',
                  content: 'Grandchild 2',
                }),
              },
            },
          },
        },
      },
    })
  return {
    commit,
    workspace,
    user,
    project,
    document: documents.find((doc) => doc.path === 'some-folder/parent')!,
    documents,
  }
}
