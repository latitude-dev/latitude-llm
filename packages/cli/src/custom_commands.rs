//! Helpers for grafting custom CLI subcommands onto a spec-derived
//! command tree and walking parsed `ArgMatches` to dispatch them.
//!
//! Used by `app::CliApp::command()` / `command_under()` at the root
//! level. The free functions `graft_subcommand` and
//! `walk_matches_to_custom` are the public (crate-internal) API.

/// Graft a custom `clap::Command` into an existing command tree under
/// `parent_path`. The leaf name is `cmd.get_name()`.
///
/// Behavior:
/// - Walks down `parent_path` using `mut_subcommand`, recursively grafting.
/// - At any level where the named parent doesn't exist, creates it as a
///   bare subcommand so the path is reachable.
/// - At the leaf level, if a subcommand with the same name already exists
///   it is replaced by `cmd` (custom-wins on leaf collision).
pub fn graft_subcommand(
    parent: clap::Command,
    parent_path: &[String],
    cmd: clap::Command,
) -> clap::Command {
    if parent_path.is_empty() {
        let leaf_name = cmd.get_name().to_string();
        if parent.find_subcommand(&leaf_name).is_some() {
            parent.mut_subcommand(leaf_name, move |_existing| cmd)
        } else {
            parent.subcommand(cmd)
        }
    } else {
        let head = parent_path[0].clone();
        let rest: Vec<String> = parent_path[1..].to_vec();
        if parent.find_subcommand(&head).is_some() {
            parent.mut_subcommand(head, move |sub| graft_subcommand(sub, &rest, cmd))
        } else {
            let new_parent = clap::Command::new(head)
                .subcommand_required(true)
                .arg_required_else_help(true);
            let new_parent = graft_subcommand(new_parent, &rest, cmd);
            parent.subcommand(new_parent)
        }
    }
}

/// Walk a parsed `ArgMatches` tree along `parent_path` and return the leaf
/// matches if the final subcommand equals `leaf_name`. Returns `None` if
/// any segment along the path doesn't match.
pub fn walk_matches_to_custom<'a>(
    matches: &'a clap::ArgMatches,
    parent_path: &[String],
    leaf_name: &str,
) -> Option<&'a clap::ArgMatches> {
    let mut current = matches;
    for seg in parent_path {
        let (name, sub) = current.subcommand()?;
        if name != seg {
            return None;
        }
        current = sub;
    }
    let (name, sub) = current.subcommand()?;
    if name == leaf_name {
        Some(sub)
    } else {
        None
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::error::CliError;

    // ── Registry (test-only) ────────────────────────────────────────
    //
    // `CustomCommandRegistry<C>` was the old per-binding custom command
    // system. Root `CliApp::command()` replaced it, but the struct is
    // still useful for testing `graft_subcommand` / `walk_matches_to_custom`.

    type HandlerFn<C> = fn(&clap::ArgMatches, &C) -> Result<(), CliError>;
    type Entry<C> = (Vec<String>, clap::Command, HandlerFn<C>);

    struct CustomCommandRegistry<C> {
        entries: Vec<Entry<C>>,
    }

    impl<C> CustomCommandRegistry<C> {
        fn new() -> Self {
            Self { entries: Vec::new() }
        }

        fn register(&mut self, cmd: clap::Command, handler: HandlerFn<C>) {
            self.register_under::<&str>(&[], cmd, handler);
        }

        fn register_under<S: AsRef<str>>(
            &mut self,
            path: &[S],
            cmd: clap::Command,
            handler: HandlerFn<C>,
        ) {
            let owned: Vec<String> = path.iter().map(|s| s.as_ref().to_string()).collect();
            self.entries.push((owned, cmd, handler));
        }

        fn graft_into(&self, mut cli: clap::Command) -> clap::Command {
            for (path, cmd, _) in &self.entries {
                cli = graft_subcommand(cli, path, cmd.clone());
            }
            cli
        }

        fn dispatch(
            &self,
            matches: &clap::ArgMatches,
            ctx: &C,
        ) -> Option<Result<(), CliError>> {
            for (path, cmd, handler) in &self.entries {
                if let Some(target) = walk_matches_to_custom(matches, path, cmd.get_name()) {
                    return Some(handler(target, ctx));
                }
            }
            None
        }

        fn len(&self) -> usize {
            self.entries.len()
        }

        fn entries(&self) -> &[Entry<C>] {
            &self.entries
        }
    }

    struct DummyCtx;

    fn dummy_handler(_m: &clap::ArgMatches, _c: &DummyCtx) -> Result<(), CliError> {
        Ok(())
    }

    #[test]
    fn graft_top_level_adds_command() {
        let cli = clap::Command::new("root").subcommand(clap::Command::new("existing"));
        let custom = clap::Command::new("custom");
        let grafted = graft_subcommand(cli, &[], custom);
        assert!(grafted.find_subcommand("existing").is_some());
        assert!(grafted.find_subcommand("custom").is_some());
    }

    #[test]
    fn graft_top_level_collision_replaces_leaf() {
        let cli = clap::Command::new("root")
            .subcommand(clap::Command::new("dup").about("from spec"));
        let custom = clap::Command::new("dup").about("from custom");
        let grafted = graft_subcommand(cli, &[], custom);
        let dup = grafted.find_subcommand("dup").unwrap();
        assert_eq!(dup.get_about().map(|s| s.to_string()).as_deref(), Some("from custom"));
    }

    #[test]
    fn graft_into_existing_parent_keeps_siblings() {
        let webhooks = clap::Command::new("webhooks")
            .subcommand(clap::Command::new("list"))
            .subcommand(clap::Command::new("create"));
        let cli = clap::Command::new("root").subcommand(webhooks);

        let verify = clap::Command::new("verify").about("custom");
        let grafted = graft_subcommand(cli, &["webhooks".to_string()], verify);

        let webhooks = grafted.find_subcommand("webhooks").unwrap();
        assert!(webhooks.find_subcommand("list").is_some());
        assert!(webhooks.find_subcommand("create").is_some());
        assert!(webhooks.find_subcommand("verify").is_some());
    }

    #[test]
    fn graft_leaf_collision_under_parent_replaces() {
        let webhooks = clap::Command::new("webhooks")
            .subcommand(clap::Command::new("list").about("spec"));
        let cli = clap::Command::new("root").subcommand(webhooks);
        let custom_list = clap::Command::new("list").about("custom");
        let grafted = graft_subcommand(cli, &["webhooks".to_string()], custom_list);
        let leaf = grafted
            .find_subcommand("webhooks")
            .unwrap()
            .find_subcommand("list")
            .unwrap();
        assert_eq!(leaf.get_about().map(|s| s.to_string()).as_deref(), Some("custom"));
    }

    #[test]
    fn graft_creates_missing_intermediate_parent() {
        let cli = clap::Command::new("root");
        let leaf = clap::Command::new("verify");
        let grafted = graft_subcommand(cli, &["new-parent".to_string()], leaf);
        let parent = grafted.find_subcommand("new-parent").unwrap();
        assert!(parent.find_subcommand("verify").is_some());
    }

    #[test]
    fn walk_matches_finds_leaf() {
        let cmd = clap::Command::new("root")
            .subcommand(clap::Command::new("webhooks").subcommand(clap::Command::new("verify")));
        let matches = cmd.get_matches_from(vec!["root", "webhooks", "verify"]);
        let result = walk_matches_to_custom(&matches, &["webhooks".to_string()], "verify");
        assert!(result.is_some());
    }

    #[test]
    fn walk_matches_misses_when_path_diverges() {
        let cmd = clap::Command::new("root")
            .subcommand(clap::Command::new("webhooks").subcommand(clap::Command::new("list")));
        let matches = cmd.get_matches_from(vec!["root", "webhooks", "list"]);
        let result = walk_matches_to_custom(&matches, &["webhooks".to_string()], "verify");
        assert!(result.is_none());
    }

    #[test]
    fn walk_matches_misses_when_parent_diverges() {
        let cmd = clap::Command::new("root")
            .subcommand(clap::Command::new("other").subcommand(clap::Command::new("verify")));
        let matches = cmd.get_matches_from(vec!["root", "other", "verify"]);
        let result = walk_matches_to_custom(&matches, &["webhooks".to_string()], "verify");
        assert!(result.is_none());
    }

    #[test]
    fn registry_registers_top_level_command() {
        let mut reg: CustomCommandRegistry<DummyCtx> = CustomCommandRegistry::new();
        reg.register(clap::Command::new("custom"), dummy_handler);
        assert_eq!(reg.len(), 1);
        assert!(reg.entries()[0].0.is_empty());
        assert_eq!(reg.entries()[0].1.get_name(), "custom");
    }

    #[test]
    fn registry_registers_under_path() {
        let mut reg: CustomCommandRegistry<DummyCtx> = CustomCommandRegistry::new();
        reg.register_under(&["webhooks"], clap::Command::new("verify"), dummy_handler);
        assert_eq!(reg.len(), 1);
        assert_eq!(reg.entries()[0].0, vec!["webhooks".to_string()]);
        assert_eq!(reg.entries()[0].1.get_name(), "verify");
    }

    #[test]
    fn registry_graft_into_grafts_all_entries() {
        let mut reg: CustomCommandRegistry<DummyCtx> = CustomCommandRegistry::new();
        reg.register(clap::Command::new("alpha"), dummy_handler);
        reg.register_under(&["webhooks"], clap::Command::new("verify"), dummy_handler);

        let cli = clap::Command::new("root");
        let grafted = reg.graft_into(cli);

        assert!(grafted.find_subcommand("alpha").is_some());
        let webhooks = grafted.find_subcommand("webhooks").unwrap();
        assert!(webhooks.find_subcommand("verify").is_some());
    }

    #[test]
    fn registry_dispatch_invokes_matching_handler() {
        use std::cell::Cell;
        // Use thread-local state so the fn pointer (which can't capture)
        // can record that it ran.
        thread_local! {
            static CALLED: Cell<bool> = const { Cell::new(false) };
        }
        fn handler(_m: &clap::ArgMatches, _c: &DummyCtx) -> Result<(), CliError> {
            CALLED.with(|c| c.set(true));
            Ok(())
        }

        let mut reg: CustomCommandRegistry<DummyCtx> = CustomCommandRegistry::new();
        reg.register_under(&["webhooks"], clap::Command::new("verify"), handler);

        let cli = clap::Command::new("root");
        let cli = reg.graft_into(cli);
        let matches = cli.get_matches_from(vec!["root", "webhooks", "verify"]);

        let result = reg.dispatch(&matches, &DummyCtx);
        assert!(result.is_some());
        assert!(result.unwrap().is_ok());
        assert!(CALLED.with(|c| c.get()));
    }

    #[test]
    fn registry_dispatch_returns_none_when_no_custom_invoked() {
        let mut reg: CustomCommandRegistry<DummyCtx> = CustomCommandRegistry::new();
        reg.register_under(&["webhooks"], clap::Command::new("verify"), dummy_handler);

        // Build a tree that has both a custom and a non-custom path.
        let cli = clap::Command::new("root")
            .subcommand(clap::Command::new("other").subcommand(clap::Command::new("thing")));
        let cli = reg.graft_into(cli);
        let matches = cli.get_matches_from(vec!["root", "other", "thing"]);

        let result = reg.dispatch(&matches, &DummyCtx);
        assert!(result.is_none());
    }

    // ── Typed command tests ─────────────────────────────────────────

    use clap::{Args, FromArgMatches};

    #[derive(clap::Args, Debug, PartialEq)]
    struct AdoptArgs {
        #[arg(long)]
        name: String,
        #[arg(long)]
        tag: Option<String>,
    }

    #[test]
    fn typed_command_augments_args_onto_command() {
        let base = clap::Command::new("adopt").about("Adopt a pet");
        let augmented = AdoptArgs::augment_args(base);
        // The augmented command should have --name and --tag arguments.
        let args: Vec<_> = augmented.get_arguments().map(|a| a.get_id().as_str().to_string()).collect();
        assert!(args.contains(&"name".to_string()), "missing --name: {args:?}");
        assert!(args.contains(&"tag".to_string()), "missing --tag: {args:?}");
    }

    #[test]
    fn typed_command_parses_args_from_matches() {
        let cmd = AdoptArgs::augment_args(clap::Command::new("adopt"));
        let matches = cmd.get_matches_from(vec!["adopt", "--name", "Fido", "--tag", "dog"]);
        let parsed = AdoptArgs::from_arg_matches(&matches).unwrap();
        assert_eq!(parsed, AdoptArgs { name: "Fido".into(), tag: Some("dog".into()) });
    }

    #[test]
    fn typed_command_parses_optional_absent() {
        let cmd = AdoptArgs::augment_args(clap::Command::new("adopt"));
        let matches = cmd.get_matches_from(vec!["adopt", "--name", "Buddy"]);
        let parsed = AdoptArgs::from_arg_matches(&matches).unwrap();
        assert_eq!(parsed, AdoptArgs { name: "Buddy".into(), tag: None });
    }

    #[test]
    fn typed_command_erased_dispatch_round_trip() {
        use std::cell::Cell;
        thread_local! {
            static SEEN_NAME: Cell<Option<String>> = const { Cell::new(None) };
        }

        // Build the erased handler the same way CliApp::command_typed_with does:
        // handler is fn(A, &C) and the closure does downcast + parse internally.
        fn my_handler(args: AdoptArgs, _ctx: &DummyCtx) -> Result<(), CliError> {
            SEEN_NAME.with(|c| c.set(Some(args.name)));
            Ok(())
        }

        let handler_fn: fn(AdoptArgs, &DummyCtx) -> Result<(), CliError> = my_handler;
        let erased: crate::app::CliCommandHandler = Box::new(move |matches, ctx| {
            let args = AdoptArgs::from_arg_matches(matches)
                .map_err(|e| CliError::Validation(e.to_string()))?;
            let ctx = ctx.downcast_ref::<DummyCtx>().ok_or_else(|| {
                CliError::Validation("binding context type mismatch".into())
            })?;
            handler_fn(args, ctx)
        });

        let cmd = AdoptArgs::augment_args(clap::Command::new("adopt"));
        let cli = graft_subcommand(clap::Command::new("root"), &[], cmd.clone());
        let matches = cli.get_matches_from(vec!["root", "adopt", "--name", "Rex"]);
        let target = walk_matches_to_custom(&matches, &[], "adopt").unwrap();

        erased(target, &DummyCtx as &dyn std::any::Any).unwrap();
        assert_eq!(SEEN_NAME.with(|c| c.take()), Some("Rex".to_string()));
    }

    #[test]
    fn typed_command_context_mismatch_returns_error() {
        fn my_handler(_args: AdoptArgs, _ctx: &DummyCtx) -> Result<(), CliError> {
            Ok(())
        }

        let handler_fn: fn(AdoptArgs, &DummyCtx) -> Result<(), CliError> = my_handler;
        let erased: crate::app::CliCommandHandler = Box::new(move |matches, ctx| {
            let args = AdoptArgs::from_arg_matches(matches)
                .map_err(|e| CliError::Validation(e.to_string()))?;
            let ctx = ctx.downcast_ref::<DummyCtx>().ok_or_else(|| {
                CliError::Validation("binding context type mismatch".into())
            })?;
            handler_fn(args, ctx)
        });

        let cmd = AdoptArgs::augment_args(clap::Command::new("adopt"));
        let cli = graft_subcommand(clap::Command::new("root"), &[], cmd.clone());
        let matches = cli.get_matches_from(vec!["root", "adopt", "--name", "Rex"]);
        let target = walk_matches_to_custom(&matches, &[], "adopt").unwrap();

        // Pass wrong context type — should get a Validation error.
        let result = erased(target, &42u32 as &dyn std::any::Any);
        assert!(result.is_err());
        let err = result.unwrap_err();
        match err {
            CliError::Validation(msg) => assert!(msg.contains("mismatch"), "unexpected: {msg}"),
            other => panic!("expected Validation error, got: {other:?}"),
        }
    }
}
