#include <iostream>
#include <vector>
#include <string>

// Simple log entry struct
struct LogEntry {
    std::string timestamp;
    std::string severity;
    std::string message;
};

class LogAnalyzer {
public:
    void addEntry(const LogEntry& entry) {
        entries.push_back(entry);
    }

    void printHighSeverity() const {
        for (const auto& entry : entries) {
            if (entry.severity == "high" || entry.severity == "critical") {
                std::cout << "[" << entry.timestamp << "] "
                          << entry.severity << ": "
                          << entry.message << std::endl;
            }
        }
    }

private:
    std::vector<LogEntry> entries;
};

int main() {
    LogAnalyzer analyzer;
    analyzer.addEntry({"2024-06-01 12:00:00", "low", "Startup complete"});
    analyzer.addEntry({"2024-06-01 12:01:00", "high", "HTTP 500 error detected"});
    analyzer.addEntry({"2024-06-01 12:02:00", "critical", "Disk failure"});

    std::cout << "High severity log entries:" << std::endl;
    analyzer.printHighSeverity();

    return 0;
}