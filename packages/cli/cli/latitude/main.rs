mod latitude;

fn main() {
    if let Err(error) = latitude::run(include_str!("openapi0.json")) {
        eprintln!("{error}");
        std::process::exit(error.exit_code());
    }
}
