//! Stability levels for commands in the CLI tree.
//!
//! Commands can be annotated with a [`Stability`] level. Pre-GA commands
//! are hidden from `--help` and gated behind `--maturity <level>`.

/// Stability level for a command or command group.
///
/// Ordered most-mature → least: `Stable > Rc > Beta > Alpha > EarlyAccess`.
#[derive(Debug, Clone, PartialEq, Eq)]
#[non_exhaustive]
pub enum Stability {
    Stable,
    Rc,
    Beta,
    Alpha,
    EarlyAccess,
    Deprecated {
        message: String,
        replacement: Option<String>,
        removed_in: Option<String>,
    },
    Removed {
        message: String,
    },
}

impl Stability {
    /// Numeric rank for maturity comparison. Lower = more mature.
    /// `Deprecated` and `Removed` are special — they are always visible
    /// (with a badge) and don't participate in maturity gating.
    pub fn rank(&self) -> u8 {
        match self {
            Self::Stable => 0,
            Self::Rc => 1,
            Self::Beta => 2,
            Self::Alpha => 3,
            Self::EarlyAccess => 4,
            Self::Deprecated { .. } => 0, // always visible
            Self::Removed { .. } => 255,
        }
    }

    /// Badge text shown in `--help` output (e.g. `[beta]`, `[deprecated]`).
    pub fn badge(&self) -> Option<&'static str> {
        match self {
            Self::Stable => None,
            Self::Rc => Some("[rc]"),
            Self::Beta => Some("[beta]"),
            Self::Alpha => Some("[alpha]"),
            Self::EarlyAccess => Some("[early-access]"),
            Self::Deprecated { .. } => Some("[deprecated]"),
            Self::Removed { .. } => Some("[removed]"),
        }
    }

    /// Returns `true` if this command should be visible at the given
    /// maturity level (lower rank = more mature).
    pub fn visible_at(&self, maturity_rank: u8) -> bool {
        match self {
            // Deprecated commands are always visible (with badge).
            Self::Deprecated { .. } => true,
            // Removed commands are never visible.
            Self::Removed { .. } => false,
            // GA and pre-GA: visible if the user's threshold allows it.
            _ => self.rank() <= maturity_rank,
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn rank_ordering() {
        assert!(Stability::Stable.rank() < Stability::Rc.rank());
        assert!(Stability::Rc.rank() < Stability::Beta.rank());
        assert!(Stability::Beta.rank() < Stability::Alpha.rank());
        assert!(Stability::Alpha.rank() < Stability::EarlyAccess.rank());
    }

    #[test]
    fn visible_at_threshold() {
        // Stable is always visible at default (0)
        assert!(Stability::Stable.visible_at(0));
        // Beta is NOT visible at default (0)
        assert!(!Stability::Beta.visible_at(0));
        // Beta IS visible at rank 2+
        assert!(Stability::Beta.visible_at(2));
        assert!(Stability::Beta.visible_at(4));
    }

    #[test]
    fn deprecated_always_visible() {
        let dep = Stability::Deprecated {
            message: "use v2".into(),
            replacement: None,
            removed_in: None,
        };
        assert!(dep.visible_at(0));
        assert!(dep.visible_at(4));
    }

    #[test]
    fn removed_never_visible() {
        let rem = Stability::Removed {
            message: "gone".into(),
        };
        assert!(!rem.visible_at(0));
        assert!(!rem.visible_at(255));
    }

    #[test]
    fn badge_text() {
        assert_eq!(Stability::Stable.badge(), None);
        assert_eq!(Stability::Beta.badge(), Some("[beta]"));
        assert_eq!(
            Stability::Deprecated {
                message: String::new(),
                replacement: None,
                removed_in: None,
            }
            .badge(),
            Some("[deprecated]")
        );
    }
}
