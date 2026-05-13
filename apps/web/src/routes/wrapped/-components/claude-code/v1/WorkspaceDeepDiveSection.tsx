import type { WrappedReportRecord } from "@domain/spans"

interface WorkspaceDeepDiveSectionProps {
  readonly workspace: WrappedReportRecord["report"]["workspaceDeepDives"][number]
}

const TOOL_LABEL: Record<string, string> = {
  bash: "Bash",
  read: "Read",
  edit: "Edit",
  write: "Write",
  search: "Search",
  research: "Research",
  plan: "Plan",
  other: "Other",
}

const formatCompact = (n: number): string => n.toLocaleString("en-US")

function FileRow({ file }: { file: WrappedReportRecord["report"]["workspaceDeepDives"][number]["topFiles"][number] }) {
  const stat: React.ReactNode = (() => {
    if (file.linesAdded > 0 || file.linesRemoved > 0) {
      return (
        <span className="whitespace-nowrap">
          <span style={{ color: "#D97555" }}>{`+${formatCompact(file.linesAdded)}`}</span>
          <span style={{ color: "#6E6A5E" }}>{" / "}</span>
          <span>{`−${formatCompact(file.linesRemoved)}`}</span>
        </span>
      )
    }
    if (file.reads > 0) {
      return `${formatCompact(file.reads)} read${file.reads === 1 ? "" : "s"}`
    }
    return `${formatCompact(file.touches)} touch${file.touches === 1 ? "" : "es"}`
  })()
  return (
    <tr className="border-b last:border-0" style={{ borderColor: "#E8E4D8" }}>
      <td className="py-2 pr-3 font-mono text-xs break-all sm:text-sm" style={{ color: "#1A1A1A" }}>
        {file.displayPath}
      </td>
      <td className="py-2 pl-3 text-right text-sm" style={{ color: "#1A1A1A" }}>
        {stat}
      </td>
    </tr>
  )
}

export function WorkspaceDeepDiveSection({ workspace }: WorkspaceDeepDiveSectionProps) {
  const dominantLabel = TOOL_LABEL[workspace.dominantTool] ?? "Other"
  const breadthParts: string[] = [
    `${formatCompact(workspace.toolCalls)} tool calls`,
    `${formatCompact(workspace.sessions)} session${workspace.sessions === 1 ? "" : "s"}`,
  ]
  if (workspace.commits > 0)
    breadthParts.push(`${formatCompact(workspace.commits)} commit${workspace.commits === 1 ? "" : "s"}`)
  breadthParts.push(`mostly ${dominantLabel}`)

  return (
    <section>
      <h3 className="text-xl sm:text-2xl" style={{ fontFamily: "Georgia, serif", color: "#1A1A1A", fontWeight: 500 }}>
        {workspace.name}
      </h3>
      <p className="mt-1 text-xs sm:text-sm" style={{ color: "#6E6A5E", fontFamily: "Georgia, serif" }}>
        {breadthParts.join(" · ")}
      </p>

      {workspace.topFiles.length > 0 ? (
        <div className="mt-4">
          <p
            className="mb-2 text-[11px] uppercase tracking-[0.12em]"
            style={{ color: "#6E6A5E", fontFamily: "Georgia, serif" }}
          >
            Top files
          </p>
          <table className="w-full">
            <tbody>
              {workspace.topFiles.map((file, idx) => (
                <FileRow key={`${idx}-${file.displayPath}`} file={file} />
              ))}
            </tbody>
          </table>
        </div>
      ) : null}

      {workspace.topBashCommands.length > 0 ? (
        <div className="mt-4">
          <p
            className="mb-2 text-[11px] uppercase tracking-[0.12em]"
            style={{ color: "#6E6A5E", fontFamily: "Georgia, serif" }}
          >
            Top commands
          </p>
          <table className="w-full">
            <tbody>
              {workspace.topBashCommands.map((cmd) => (
                <tr className="border-b last:border-0" key={cmd.pattern} style={{ borderColor: "#E8E4D8" }}>
                  <td className="py-2 pr-3 font-mono text-xs sm:text-sm" style={{ color: "#1A1A1A" }}>
                    {cmd.pattern}
                  </td>
                  <td className="py-2 pl-3 text-right text-sm whitespace-nowrap" style={{ color: "#6E6A5E" }}>
                    {`${formatCompact(cmd.count)} run${cmd.count === 1 ? "" : "s"}`}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}

      {workspace.topBranches.length > 0 ? (
        <div className="mt-4">
          <p
            className="mb-2 text-[11px] uppercase tracking-[0.12em]"
            style={{ color: "#6E6A5E", fontFamily: "Georgia, serif" }}
          >
            Active branches
          </p>
          <p className="text-sm" style={{ color: "#1A1A1A", fontFamily: "Georgia, serif" }}>
            {workspace.topBranches.join(" · ")}
          </p>
        </div>
      ) : null}
    </section>
  )
}
