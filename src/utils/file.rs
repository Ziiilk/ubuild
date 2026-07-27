use std::fs::{self, Permissions};
use std::io::{self, Write};
use std::path::Path;

use anyhow::{Context, Result};
use tempfile::NamedTempFile;

use super::logger::Logger;

pub fn atomic_write(path: &Path, contents: impl AsRef<[u8]>) -> Result<()> {
    if !path.exists() {
        return fs::write(path, contents)
            .with_context(|| format!("Failed to write {}", path.display()));
    }

    replace_existing(path, |temporary| temporary.write_all(contents.as_ref()))
}

pub fn atomic_copy(source: &Path, destination: &Path) -> Result<()> {
    if !destination.exists() {
        fs::copy(source, destination).with_context(|| {
            format!(
                "Failed to copy {} to {}",
                source.display(),
                destination.display()
            )
        })?;
        return Ok(());
    }

    let mut source_file =
        fs::File::open(source).with_context(|| format!("Failed to read {}", source.display()))?;
    replace_existing(destination, |temporary| {
        io::copy(&mut source_file, temporary).map(|_| ())
    })
}

fn replace_existing(
    path: &Path,
    write_contents: impl FnOnce(&mut fs::File) -> io::Result<()>,
) -> Result<()> {
    let original_permissions = fs::metadata(path)
        .map(|metadata| metadata.permissions())
        .with_context(|| format!("Failed to read permissions for {}", path.display()))?;
    let was_readonly = original_permissions.readonly();

    if was_readonly {
        let writable_permissions = writable_permissions(original_permissions.clone());
        fs::set_permissions(path, writable_permissions)
            .with_context(|| format!("Failed to make {} writable", path.display()))?;
        Logger::warning(&format!(
            "Temporarily removed read-only attribute: {}",
            path.display()
        ));
    }

    let write_result = write_atomic(path, write_contents);

    if let Err(write_error) = write_result {
        if was_readonly {
            if let Err(restore_error) = fs::set_permissions(path, original_permissions) {
                return Err(write_error).with_context(|| {
                    format!(
                        "Failed to restore permissions for {} after write failure: {restore_error}",
                        path.display()
                    )
                });
            }
        }
        return Err(write_error);
    }

    fs::set_permissions(path, original_permissions).with_context(|| {
        format!(
            "Content was updated, but failed to restore permissions for {}",
            path.display()
        )
    })?;

    Ok(())
}

fn write_atomic(
    path: &Path,
    write_contents: impl FnOnce(&mut fs::File) -> io::Result<()>,
) -> Result<()> {
    let parent = path.parent().with_context(|| {
        format!(
            "Cannot determine parent directory for destination {}",
            path.display()
        )
    })?;
    let mut temporary = NamedTempFile::new_in(parent)
        .with_context(|| format!("Failed to create temporary file beside {}", path.display()))?;

    write_contents(temporary.as_file_mut())
        .with_context(|| format!("Failed to write temporary file for {}", path.display()))?;
    temporary
        .as_file_mut()
        .sync_all()
        .with_context(|| format!("Failed to sync temporary file for {}", path.display()))?;
    temporary
        .persist(path)
        .map_err(|error| error.error)
        .with_context(|| format!("Failed to replace {}", path.display()))?;

    Ok(())
}

#[cfg(unix)]
fn writable_permissions(mut permissions: Permissions) -> Permissions {
    use std::os::unix::fs::PermissionsExt;

    permissions.set_mode(permissions.mode() | 0o200);
    permissions
}

#[cfg(windows)]
#[allow(clippy::permissions_set_readonly_false)]
fn writable_permissions(mut permissions: Permissions) -> Permissions {
    permissions.set_readonly(false);
    permissions
}

#[cfg(test)]
mod tests {
    use std::fs;

    use anyhow::Result;
    use tempfile::tempdir;

    use super::atomic_write;

    #[test]
    fn writes_new_file() -> Result<()> {
        let directory = tempdir()?;
        let path = directory.path().join("new.txt");

        atomic_write(&path, "new content")?;

        assert_eq!(fs::read_to_string(path)?, "new content");
        Ok(())
    }

    #[cfg(unix)]
    #[test]
    fn new_file_uses_standard_creation_permissions() -> Result<()> {
        use std::os::unix::fs::PermissionsExt;

        let directory = tempdir()?;
        let expected_path = directory.path().join("expected.txt");
        let actual_path = directory.path().join("actual.txt");
        fs::write(&expected_path, "content")?;

        atomic_write(&actual_path, "content")?;

        let expected_mode = fs::metadata(expected_path)?.permissions().mode();
        let actual_mode = fs::metadata(actual_path)?.permissions().mode();
        assert_eq!(actual_mode, expected_mode);
        Ok(())
    }

    #[test]
    fn replaces_existing_file() -> Result<()> {
        let directory = tempdir()?;
        let path = directory.path().join("existing.txt");
        fs::write(&path, "old content")?;

        atomic_write(&path, "new content")?;

        assert_eq!(fs::read_to_string(path)?, "new content");
        Ok(())
    }

    #[test]
    fn restores_readonly_permissions() -> Result<()> {
        let directory = tempdir()?;
        let path = directory.path().join("readonly.txt");
        fs::write(&path, "old content")?;
        let mut permissions = fs::metadata(&path)?.permissions();
        permissions.set_readonly(true);
        fs::set_permissions(&path, permissions)?;

        atomic_write(&path, "new content")?;

        assert_eq!(fs::read_to_string(&path)?, "new content");
        assert!(fs::metadata(path)?.permissions().readonly());
        Ok(())
    }

    #[test]
    fn restores_permissions_and_cleans_up_after_replace_failure() -> Result<()> {
        let directory = tempdir()?;
        let path = directory.path().join("destination");
        fs::create_dir(&path)?;
        let mut permissions = fs::metadata(&path)?.permissions();
        permissions.set_readonly(true);
        fs::set_permissions(&path, permissions)?;
        let entries_before = fs::read_dir(directory.path())?.count();

        let result = atomic_write(&path, "content");

        assert!(result.is_err());
        assert!(fs::metadata(&path)?.permissions().readonly());
        assert_eq!(fs::read_dir(directory.path())?.count(), entries_before);
        Ok(())
    }
}
