use crate::cli::ManagedProcessArgs;
use crate::core::process_runner::ProcessRunner;
use crate::utils::logger::Logger;

pub fn execute(args: ManagedProcessArgs) -> ! {
    match ProcessRunner::run_managed(&args.gate, &args.program, args.cwd.as_deref(), &args.args) {
        Ok(exit_code) => std::process::exit(exit_code),
        Err(error) => {
            Logger::error(&format!("{error:#}"));
            std::process::exit(1);
        }
    }
}
