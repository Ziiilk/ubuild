#![allow(dead_code)]

mod cli;
mod commands;
mod core;
mod error;
mod platform;
mod types;
mod utils;

use clap::Parser;

fn main() {
    let cli = cli::Cli::parse();

    let result = match cli.command {
        cli::Command::Build(args) => commands::build::execute(args),
        cli::Command::List(args) => commands::list::execute(args),
        cli::Command::Engine(args) => commands::engine::execute(args),
        cli::Command::Generate(args) => commands::generate::execute(args),
        cli::Command::Init(args) => commands::init::execute(args),
        cli::Command::Run(args) => commands::run::execute(args),
        cli::Command::Update => commands::update::execute(),
        cli::Command::Gencodebase(args) => commands::gencodebase::execute(args),
        cli::Command::Clean(args) => commands::clean::execute(args),
        cli::Command::Switch(args) => commands::switch::execute(args),
        cli::Command::Version(args) => commands::version::execute(args),
    };

    if let Err(e) = result {
        utils::logger::Logger::error(&format!("{e:#}"));
        std::process::exit(1);
    }
}
