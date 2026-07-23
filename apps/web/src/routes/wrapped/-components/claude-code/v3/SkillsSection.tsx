import type { ReportV3 } from "@domain/spans"
import { WRAPPED_COLORS } from "../v1/personality-copy.ts"
import { formatCompact } from "../v1/WrappedReportV1.tsx"

const { creamDeep: CREAM_DEEP, accent: ACCENT, ink: INK, muted: MUTED } = WRAPPED_COLORS

function StatTile({ label, value }: { readonly label: string; readonly value: string }) {
  return (
    <div className="flex flex-col gap-2 rounded-xl px-4 py-5 text-center" style={{ backgroundColor: CREAM_DEEP }}>
      <p className="text-[11px] uppercase tracking-[0.14em]" style={{ color: MUTED, fontFamily: "Georgia, serif" }}>
        {label}
      </p>
      <p className="text-2xl sm:text-3xl" style={{ color: INK, fontFamily: "Georgia, serif", fontWeight: 500 }}>
        {value}
      </p>
    </div>
  )
}

/**
 * Skills breakdown. The two headline tiles (distinct + total) are public; the
 * ranked top-3 list is member-only — non-member records arrive with `top: []`
 * (redacted server-side), so the list simply doesn't render for them.
 */
export function SkillsSection({
  skills,
  isMember,
}: {
  readonly skills: ReportV3["skills"]
  readonly isMember: boolean
}) {
  if (skills.totalUses <= 0) return null
  return (
    <section>
      <h2
        className="text-center text-2xl sm:text-3xl"
        style={{ fontFamily: "Georgia, serif", color: INK, fontWeight: 500 }}
      >
        Skills you leaned on
      </h2>
      <div className="mt-6 grid grid-cols-2 gap-3">
        <StatTile label="Skills used" value={formatCompact(skills.distinctUsed)} />
        <StatTile label="Skill uses" value={formatCompact(skills.totalUses)} />
      </div>

      {isMember && skills.top.length > 0 ? (
        <div className="mt-6">
          <p
            className="mb-2 text-[11px] uppercase tracking-[0.12em]"
            style={{ color: MUTED, fontFamily: "Georgia, serif" }}
          >
            Most used
          </p>
          <table className="w-full">
            <tbody>
              {skills.top.map((skill) => (
                <tr className="border-b last:border-0" key={skill.name} style={{ borderColor: CREAM_DEEP }}>
                  <td className="py-2 pr-3 font-mono text-xs break-all sm:text-sm" style={{ color: INK }}>
                    {skill.name}
                  </td>
                  <td className="py-2 pl-3 text-right text-sm whitespace-nowrap" style={{ color: ACCENT }}>
                    {`${formatCompact(skill.count)} use${skill.count === 1 ? "" : "s"}`}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
    </section>
  )
}
