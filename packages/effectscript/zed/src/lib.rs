//! The EffectScript extension for Zed (ADR-0058): starts `efx lsp`, the EffectScript language
//! server, from the project's own install when it has one, otherwise from PATH.

use zed_extension_api::{self as zed, LanguageServerId, Result};

/// Where `efx` lives in a project that installed it with npm, relative to the worktree root.
const LOCAL_EFX: &str = "node_modules/.bin/efx";

/// The command for `efx lsp`: the project's `efx` (given its root when it exists), else `efx` on
/// PATH, else an error that says how to install it.
pub fn efx_lsp(local_root: Option<&str>, on_path: Option<String>) -> Result<(String, Vec<String>)> {
    let command = match (local_root, on_path) {
        (Some(root), _) => format!("{}/{}", root.trim_end_matches('/'), LOCAL_EFX),
        (None, Some(path)) => path,
        (None, None) => {
            return Err(
                "EffectScript: `efx` isn't installed. Run `npm i -D effectscript` in the project, or \
                 `curl -fsSL https://effectscript.dev/install | sh`."
                    .into(),
            )
        }
    };
    Ok((command, vec!["lsp".into()]))
}

struct EffectScript;

impl zed::Extension for EffectScript {
    fn new() -> Self {
        EffectScript
    }

    fn language_server_command(
        &mut self,
        _language_server_id: &LanguageServerId,
        worktree: &zed::Worktree,
    ) -> Result<zed::Command> {
        let root = worktree.root_path();
        let local = worktree.read_text_file(LOCAL_EFX).ok().map(|_| root.as_str());
        let (command, args) = efx_lsp(local, worktree.which("efx"))?;
        Ok(zed::Command { command, args, env: worktree.shell_env() })
    }
}

zed::register_extension!(EffectScript);

#[cfg(test)]
mod tests {
    use super::efx_lsp;

    #[test]
    fn prefers_the_project_install() {
        let (command, args) = efx_lsp(Some("/work/app/"), Some("/usr/local/bin/efx".into())).unwrap();
        assert_eq!(command, "/work/app/node_modules/.bin/efx");
        assert_eq!(args, vec!["lsp"]);
    }

    #[test]
    fn falls_back_to_path() {
        let (command, args) = efx_lsp(None, Some("/usr/local/bin/efx".into())).unwrap();
        assert_eq!(command, "/usr/local/bin/efx");
        assert_eq!(args, vec!["lsp"]);
    }

    #[test]
    fn says_how_to_install_efx() {
        let message = efx_lsp(None, None).unwrap_err();
        assert!(message.contains("npm i -D effectscript"));
    }
}
