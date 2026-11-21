import Foundation
import PDFKit
#if canImport(UIKit)
import UIKit
typealias PlatformColor = UIColor
typealias PlatformFont = UIFont
#else
import AppKit
typealias PlatformColor = NSColor
typealias PlatformFont = NSFont
#endif

enum MarkerColor: String, CaseIterable, Codable, Identifiable {
    case blue, pink, yellow, green
    var id: String { rawValue }
    var uiColor: PlatformColor {
        switch self {
        case .blue: return PlatformColor(red: 0.36, green: 0.78, blue: 1, alpha: 1)
        case .pink: return PlatformColor(red: 1, green: 0.45, blue: 0.65, alpha: 1)
        case .yellow: return PlatformColor(red: 1, green: 0.75, blue: 0, alpha: 1)
        case .green: return PlatformColor(red: 0.22, green: 0.85, blue: 0.48, alpha: 1)
        }
    }
}

struct EngineOptions: Codable, Equatable {
    static let presets = ["3 PCT", "A/C", "ACTUAL", "AGTOW", "ALERT LEVEL", "ALTN", "AMD", "AMEND", "AMDT", "APMS", "APPLY", "789", "781", "CAUTION", "CCF", "CDL", "CFP PLAN", "CHANGES", "CLOSURE", "CRZ", "DIFFERENCE", "DISC", "DO NOT USE", "EDTO", "EFB", "ELDW", "EMERGENCY", "ENTRY POINT", "ERA", "ETP", "EXC SKED", "FOD", "FOM", "ILS", "KAL", "KE NOT", "KE ROUTE", "LDW", "MEL", "MINIMA", "MOD TURB", "MTOW", "NO AFFECTED", "NO KE", "NO COMPANY", "NO OPS RTE", "NOT TO", "OUT OF SERVICE", "OUTAGE", "OVC", "RA", "REFILE", "RQRD", "RUNWAY", "SH", "TAKE OFF WEIGHT", "TOW", "TRIP", "TS", "UNRELIABLE", "UNSERVICEABLE", "WX DEV"]
    var keywords = Set(presets)
    var customWords: [String] = []
    var badgesOnly = false
    var keepBookmarks = false
    var underline = false
    var customWholeLine = false
    var color = MarkerColor.pink
}

enum FlightRules {
    static func matches(_ pattern: String, _ text: String) -> [NSTextCheckingResult] {
        guard let regex = try? NSRegularExpression(pattern: pattern, options: [.caseInsensitive]) else { return [] }
        return regex.matches(in: text, range: NSRange(text.startIndex..., in: text))
    }
    static func capture(_ pattern: String, _ text: String, group: Int = 1) -> String? {
        guard let match = matches(pattern, text).first, group < match.numberOfRanges,
              let range = Range(match.range(at: group), in: text) else { return nil }
        return String(text[range])
    }
    static func contains(_ pattern: String, _ text: String) -> Bool { !matches(pattern, text).isEmpty }
    static func wordPattern(_ word: String, custom: Bool = false) -> String {
        if custom {
            return word.filter { !$0.isWhitespace }.map { NSRegularExpression.escapedPattern(for: String($0)) }.joined(separator: "\\s*")
        }
        let escaped = word.split(whereSeparator: \.isWhitespace).map { NSRegularExpression.escapedPattern(for: String($0)) }.joined(separator: "\\s+")
        return "(?<![A-Z0-9])" + escaped + ((word == "RESTRICT" || word == "PROHIBIT") ? "[A-Z]*" : "") + "(?![A-Z0-9])"
    }
    static func minutes(_ value: String) -> Int? {
        let clean = value.replacingOccurrences(of: ".", with: "").replacingOccurrences(of: ":", with: "")
        guard clean.count == 4, let hours = Int(clean.prefix(2)), let minutes = Int(clean.suffix(2)), minutes < 60 else { return nil }
        return hours * 60 + minutes
    }
    static func time(_ minutes: Int) -> String { String(format: "%02d:%02d", minutes / 60, minutes % 60) }
    static func dutyBadge(_ trip: String) -> String? {
        guard let duration = minutes(trip) else { return nil }
        if duration >= 690 { return "REST TIME \(time(Int((Double(duration) / 2).rounded())))" }
        if duration >= 450 {
            return "REST TIME \(time(Int((Double(duration) * 2 / 3).rounded()))) (\(time(Int((Double(duration) / 3).rounded()))))"
        }
        return nil
    }
    static func arrivalDay(_ etd: String, _ eta: String, _ trip: String) -> String? {
        guard let start = minutes(etd), let end = minutes(eta), let duration = minutes(trip),
              start < 1440, end < 1440, (start + duration) % 1440 == end else { return nil }
        let days = (start + duration) / 1440
        return days > 0 ? "ARR +\(days) DAY (UTC)" : nil
    }
    static func firTimes(_ ats: String, etd: String?) -> [String: String] {
        guard let etd, let start = minutes(etd), start < 1440,
              let range = ats.range(of: "EET/", options: .caseInsensitive) else { return [:] }
        var result: [String: String] = [:]
        for token in ats[range.upperBound...].split(whereSeparator: \.isWhitespace) {
            guard let code = capture(#"^([A-Z]{3,5})\d{4}$"#, String(token)),
                  let elapsed = minutes(String(token.suffix(4))) else { break }
            let total = start + elapsed
            result[code.uppercased()] = String(format: "%02d%02dZ", (total % 1440) / 60, total % 60) + (total >= 1440 ? "+\(total / 1440)" : "")
        }
        return result
    }
    static func waypointTimes(_ text: String) -> [String: String] {
        let main = text.components(separatedBy: "REFILE FLT PLAN")[0].components(separatedBy: "ENROUTE ALTERNATES")[0]
        let noise: Set<String> = ["DIST", "LATITUDE", "LONGITUDE", "WIND", "COMP", "TIME", "FUEL", "ACTL", "ACTM", "ACBO", "PLAN", "TRIP", "RESERVE", "FINAL", "REFILE", "TAKEOFF", "TANKERING", "RAMP", "ROUTE", "ALTN", "FLIGHT", "ETO", "ATO", "MSA", "TAS", "FIR"]
        var result: [String: String] = [:]
        let pattern = #"\b((?=[A-Z0-9]{0,9}[A-Z])[A-Z0-9]{2,10})\b[^\n]*?/[^\n]*?\b(\d{2}\.\d{2})\b\s+\d{3,6}\s*/?"#
        let lines = main.components(separatedBy: .newlines)
        let candidates = lines + zip(lines, lines.dropFirst()).filter { $0.0.trimmingCharacters(in: .whitespaces).hasSuffix("/") }.map { $0.0 + " " + $0.1 }
        for line in candidates {
            for match in matches(pattern, line) {
                let ns = line as NSString
                let point = ns.substring(with: match.range(at: 1)).uppercased()
                let time = ns.substring(with: match.range(at: 2))
                if !noise.contains(point), minutes(time) != nil, result[point] == nil { result[point] = time }
            }
        }
        return result
    }
    static func isWeather(_ token: String) -> Bool {
        var code = token.uppercased().trimmingCharacters(in: CharacterSet(charactersIn: "+-"))
        if code.hasPrefix("VC") { code.removeFirst(2) }
        if let prefix = ["MI", "PR", "BC", "DR", "BL", "SH", "TS", "FZ"].first(where: { code.hasPrefix($0) }) {
            code.removeFirst(2)
            if code.isEmpty { return prefix == "TS" }
        }
        if code.isEmpty { return false }
        let phenomena: Set<String> = ["DZ", "RA", "SN", "SG", "IC", "PE", "PL", "GR", "GS", "UP", "BR", "FG", "FU", "VA", "DU", "SA", "HZ", "PY", "PO", "SQ", "FC", "SS", "DS"]
        while code.count >= 2 {
            guard phenomena.contains(String(code.prefix(2))) else { return false }
            code.removeFirst(2)
        }
        return code.isEmpty
    }
}

/// Runs on an isolated worker. PDFKit objects never cross the worker/UI boundary.
enum PDFEngine {
    enum Failure: LocalizedError {
        case invalidPDF, lockedPDF, restrictedPDF, noText, exportFailed
        var errorDescription: String? {
            switch self {
            case .invalidPDF: return "유효한 PDF 문서를 열 수 없습니다."
            case .lockedPDF: return "암호로 잠긴 PDF입니다. 잠금을 해제한 파일을 선택하세요."
            case .restrictedPDF: return "주석 편집이 제한된 PDF입니다. 편집 가능한 파일을 선택하세요."
            case .noText: return "선택 가능한 텍스트를 찾지 못했습니다. 스캔 PDF 또는 지원되지 않는 글꼴 인코딩을 확인하세요."
            case .exportFailed: return "처리 결과 PDF를 저장할 수 없습니다."
            }
        }
    }
    struct Result {
        let data: Data
        let markCount: Int
        let badgeCount: Int
        let warnings: [String]
    }
    struct Line {
        let page: Int
        let range: NSRange
        let text: String
        let bounds: CGRect
    }
    private static let headings: [(String, String)] = [
        ("CFP PLAN", #"CFP\s+PLAN"#), ("REFILE POINT", #"REFILE\s+FLT\s+PLAN"#),
        ("COPY OF ATS", #"COPY\s+OF\s+ATS\s+FPL"#),
        ("DISPATCH RELEASE INFORMATION", #"DISPATCH\s+RELEASE\s+INFO(?:RMATION)?"#),
        ("EQUAL TIME POINT DATA", #"EQUAL\s+TIME\s+POINT\s+DATA"#),
        ("WEATHER BRIEFING", #"WEATHER\s+BRIEFING"#),
        ("NOTAM 1", #"\bNOTAM\s*(?:PACKAGE)?\s*[-_]?\s*1\b"#),
        ("NOTAM 2", #"\bNOTAM\s*(?:PACKAGE)?\s*[-_]?\s*2\b"#),
        ("NOTAM 3", #"\bNOTAM\s*(?:PACKAGE)?\s*[-_]?\s*3\b"#)
    ]
    private static let critical = ["CLSD", "CLOSED", "CLOSURE", "SHALL", "PROHIBIT", "RESTRICT", "NOT AVBL", "ALERT 4", "ALERT4", "MUST", "MAY NOT", "SHALL NOT", "NA", "DUE TO", "EXP", "CAUTION", "AWARE OF", "DO NOT", "ONLY AVBL", "CONFUSING", "CONFUSE", "SHOULD", "U/S"]

    static func process(_ data: Data, options: EngineOptions) throws -> Result {
        guard let document = PDFDocument(data: data), document.pageCount > 0 else { throw Failure.invalidPDF }
        guard !document.isLocked else { throw Failure.lockedPDF }
        guard document.allowsCommenting else { throw Failure.restrictedPDF }
        var lines: [Line] = []
        var pageTexts: [String] = []
        var sectionStarts: [String: Int] = [:]
        var emptyPages = 0
        for index in 0..<document.pageCount {
            guard let page = document.page(at: index) else { throw Failure.invalidPDF }
            let text = page.string ?? ""
            pageTexts.append(text)
            if text.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty { emptyPages += 1 }
            let ns = text as NSString
            var position = 0
            while position < ns.length {
                let range = ns.lineRange(for: NSRange(location: position, length: 0))
                let string = ns.substring(with: range).trimmingCharacters(in: .newlines)
                if let selection = page.selection(for: range), !string.trimmingCharacters(in: .whitespaces).isEmpty {
                    lines.append(Line(page: index, range: range, text: string, bounds: selection.bounds(for: page)))
                }
                position = NSMaxRange(range)
            }
            for (label, pattern) in headings where sectionStarts[label] == nil {
                if FlightRules.contains(pattern, text) { sectionStarts[label] = index }
            }
        }
        guard emptyPages != document.pageCount else { throw Failure.noText }
        func section(_ name: String) -> String {
            guard let start = sectionStarts[name] else { return "" }
            let end = sectionStarts.filter { $0.key != "REFILE POINT" && $0.value > start }.map(\.value).min() ?? document.pageCount
            return pageTexts[start..<end].joined(separator: "\n")
        }
        let cfp = section("CFP PLAN")
        let dispatch = section("DISPATCH RELEASE INFORMATION")
        let ats = section("COPY OF ATS")
        let wptTimes = FlightRules.waypointTimes(cfp)
        let departureTime = FlightRules.capture(#"\bETD\s+[A-Z]{3,4}\s+(\d{4})Z"#, cfp)
        let arrivalTime = FlightRules.capture(#"\bETA\s+[A-Z]{3,4}\s+(\d{4})Z"#, cfp)
        let tripTime = FlightRules.capture(#"\bTRIP\s+\d{3,5}\s+(\d{2}\.\d{2})\b"#, cfp)
        let firTimes = FlightRules.firTimes(ats, etd: departureTime ?? FlightRules.capture(#"-([A-Z]{4})(\d{4})\b"#, ats, group: 2))
        var routePoints = Set(wptTimes.keys)
        if let route = FlightRules.capture(#"-\s*[NKM]\d{4}[FASM]\d{3,4}\s+([\s\S]*?)(?=-\s*[A-Z]{4}\s*\d{4})"#, ats) {
            let tokens = Set(route.uppercased().components(separatedBy: CharacterSet.alphanumerics.inverted))
            routePoints = routePoints.intersection(tokens)
        }
        let trackPattern = #"\b(?:TRACK|TRK)\s*[-:#]?\s*(\d{1,2}|[A-Z])\b"#
        func trackID(_ value: String) -> String { Int(value).map(String.init) ?? value.uppercased() }
        let tracks = Set(FlightRules.matches(trackPattern, dispatch).map { trackID((dispatch as NSString).substring(with: $0.range(at: 1))) })
        let notamStart = ["NOTAM 1", "NOTAM 2", "NOTAM 3"].compactMap { sectionStarts[$0] }.min() ?? document.pageCount
        let thirdStart = sectionStarts["NOTAM 3"] ?? document.pageCount
        let weatherStart = sectionStarts["WEATHER BRIEFING"] ?? document.pageCount
        var excluded = Set<Int>(), fullyExcluded = Set<Int>(), block: [Int] = []
        func finishBlock() {
            guard let first = block.first else { return }
            let text = block.map { lines[$0].text }.joined(separator: " ")
            if lines[first].page >= thirdStart, FlightRules.contains(#"\bEXC\s+SKED\b"#, text) { fullyExcluded.formUnion(block) }
            if let comment = FlightRules.capture(#"\b(?:COMMENT|REMARKS?|RMK)\b\s*\)?\s*[:)]?([\s\S]*)"#, text),
               FlightRules.contains(#"\bNO\s+(?:COMPANY|KOREAN\s+AIR|KAL|KE)\b|\bNOT\s+(?:(?:APPLICABLE|VALID|AVBL|AVAILABLE)\s+(?:(?:TO|FOR)\s+)?|FOR\s+)(?:KAL|KE|KOREAN\s+AIR|COMPANY)\b|\b(?:KAL|KE)\s+(?:ROUTE|FLIGHT)\s+NOT\s+(?:AFFECTED|APPLICABLE)\b"#, comment) { excluded.formUnion(block) }
            block.removeAll()
        }
        for (index, line) in lines.enumerated() where line.page >= notamStart {
            if FlightRules.contains(#"\b[A-Z]\s*\d{4}\s*/\s*\d{2}\b"#, line.text) { finishBlock(); block.append(index) }
            else if !block.isEmpty { block.append(index) }
        }
        finishBlock()
        if !options.keepBookmarks || document.outlineRoot == nil {
            let root = PDFOutline()
            var parents: [String: PDFOutline] = [:]
            for (label, _) in headings {
                guard let index = sectionStarts[label], let page = document.page(at: index) else { continue }
                let outline = PDFOutline()
                outline.label = label
                let heading = lines.first { $0.page == index && FlightRules.contains(headings.first { $0.0 == label }!.1, $0.text) }
                outline.destination = PDFDestination(page: page, at: CGPoint(x: 0, y: heading?.bounds.maxY ?? page.bounds(for: .cropBox).maxY))
                root.insertChild(outline, at: root.numberOfChildren)
                parents[label] = outline
            }
            var airportKeys = Set<String>()
            for line in lines where line.page >= notamStart {
                guard let code = FlightRules.capture(#"\[\s*(?:DEP|DEST|ALTN|ERA|EDTO|REFILE|FIR|\d+\s*%\s*ERA)\s*\]\s*([A-Z]{3,4})\b"#, line.text),
                      let page = document.page(at: line.page) else { continue }
                let label = line.page >= thirdStart ? "NOTAM 3" : (line.page >= (sectionStarts["NOTAM 2"] ?? document.pageCount) ? "NOTAM 2" : "NOTAM 1")
                guard let parent = parents[label], airportKeys.insert(label + code).inserted else { continue }
                let child = PDFOutline(); child.label = code
                child.destination = PDFDestination(page: page, at: CGPoint(x: 0, y: line.bounds.maxY))
                parent.insertChild(child, at: parent.numberOfChildren)
            }
            document.outlineRoot = root
        }
        var markCount = 0, badgeCount = 0
        var badgeBoxes: [Int: [CGRect]] = [:]
        let color = options.color.uiColor
        let shading = PDFShading()
        // A single source of truth for annotation geometry, including rotated/cropped PDF pages.
        func mark(_ line: Line, _ range: NSRange? = nil, underline: Bool? = nil) {
            guard let page = document.page(at: line.page) else { return }
            let selectionRange = range.map { NSRange(location: line.range.location + $0.location, length: $0.length) } ?? line.range
            guard let selection = page.selection(for: selectionRange) else { return }
            for piece in selection.selectionsByLine() {
                let bounds = piece.bounds(for: page)
                guard !bounds.isEmpty, !bounds.isInfinite else { continue }
                if line.page >= thirdStart, !shading.contains(bounds, on: page) { continue }
                let annotation = PDFAnnotation(bounds: bounds, forType: (underline ?? options.underline) ? .underline : .highlight, withProperties: nil)
                // Keep the original document readable beneath the marker.
                annotation.color = color.withAlphaComponent((underline ?? options.underline) ? 0.82 : 0.20)
                annotation.contents = "NOTAM Highlighter"
                annotation.shouldPrint = true
                page.addAnnotation(annotation)
                markCount += 1
            }
        }
        func badge(_ text: String, _ line: Line) {
            guard let page = document.page(at: line.page) else { return }
            let pageBounds = page.bounds(for: .cropBox)
            let font = PlatformFont.boldSystemFont(ofSize: 9)
            let width = min((text as NSString).size(withAttributes: [.font: font]).width + 10, pageBounds.width - 28)
            var box = CGRect(x: pageBounds.maxX - width - 14, y: line.bounds.midY - 8, width: width, height: 16)
            let obstacles = lines.filter { $0.page == line.page }.map(\.bounds) + (badgeBoxes[line.page] ?? [])
            while obstacles.contains(where: { $0.insetBy(dx: -1, dy: -1).intersects(box) }), box.minY > pageBounds.minY + 20 { box.origin.y -= 18 }
            guard box.minY >= pageBounds.minY + 10, !obstacles.contains(where: { $0.intersects(box) }) else { return }
            let annotation = PDFAnnotation(bounds: box, forType: .freeText, withProperties: nil)
            annotation.contents = text
            annotation.font = font
            annotation.fontColor = PlatformColor(red: 0.15, green: 0.20, blue: 0.25, alpha: 1)
            annotation.color = PlatformColor(red: 0.88, green: 0.90, blue: 0.93, alpha: 1)
            annotation.alignment = .center
            let border = PDFBorder(); border.lineWidth = 0; annotation.border = border
            annotation.shouldPrint = true
            page.addAnnotation(annotation)
            badgeBoxes[line.page, default: []].append(box)
            badgeCount += 1
        }
        var keywords = options.keywords
        if !keywords.isEmpty, let registration = FlightRules.capture(#"\b(HL\d{4,5})\b"#, cfp) { keywords.insert(registration) }
        let patterns = keywords.sorted().map { ($0, FlightRules.wordPattern($0, custom: options.customWords.contains($0))) }
        for (index, line) in lines.enumerated() where !fullyExcluded.contains(index) {
            if !options.badgesOnly {
                let weather = line.page >= weatherStart && line.page < notamStart
                let severe = !excluded.contains(index) && critical.contains { FlightRules.contains(FlightRules.wordPattern($0), line.text) }
                let weatherCode = weather && line.text.components(separatedBy: CharacterSet(charactersIn: "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+-").inverted).contains(where: FlightRules.isWeather)
                if severe || weatherCode { mark(line) }
                else {
                    for (word, pattern) in patterns {
                        if excluded.contains(index) && critical.contains(word) { continue }
                        let ranges = FlightRules.matches(pattern, line.text)
                        if options.customWholeLine && options.customWords.contains(word) && !ranges.isEmpty { mark(line); break }
                        for match in ranges { mark(line, match.range) }
                    }
                }
                if line.page >= notamStart {
                    for match in FlightRules.matches(trackPattern, line.text) {
                        if tracks.contains(trackID((line.text as NSString).substring(with: match.range(at: 1)))) { mark(line, match.range, underline: false) }
                    }
                    for match in FlightRules.matches(#"\b[A-Z0-9]{2,10}\b"#, line.text) {
                        if routePoints.contains((line.text as NSString).substring(with: match.range).uppercased()) { mark(line, match.range, underline: true) }
                    }
                }
            }
            if line.page == sectionStarts["CFP PLAN"], FlightRules.contains(#"\b2ND\b"#, line.text),
               let trip = FlightRules.capture(#"\bTRIP\s+\d{3,5}\s+(\d{2}\.\d{2})\b"#, cfp), let text = FlightRules.dutyBadge(trip) { badge(text, line) }
            if line.page == sectionStarts["DISPATCH RELEASE INFORMATION"], FlightRules.contains(#"DISPATCH\s+NOTES"#, line.text),
               let fuel = FlightRules.capture(#"\bDISC\s+(\d{3,5}\s+\d{2}\.\d{2})\b"#, cfp) { badge("DISC FUEL INFO  " + fuel, line) }
            if line.page >= notamStart || (line.page >= weatherStart && line.page < notamStart) {
                for tag in ["DEP", "DEST"] where FlightRules.contains("\\[\\s*" + tag + "\\s*\\]", line.text) {
                    let field = tag == "DEP" ? "ETD" : "ETA"
                    if let time = FlightRules.capture("\\b" + field + #"\s+[A-Z]{3,4}\s+(\d{4})Z"#, cfp) { badge(field + " " + time + "Z", line) }
                }
                if let airport = FlightRules.capture(#"\[\s*(?:ERA|EDTO|REFILE|\d+\s*%\s*ERA)\s*\]\s*([A-Z]{3,4})\b"#, line.text),
                   let suitable = FlightRules.capture("\\b" + airport + #"\s+SUITABLE\s+FROM\s+(\d{4})\s+UTC\s*/\s*TO\s+(\d{4})\s+UTC"#, cfp),
                   let to = FlightRules.capture("\\b" + airport + #"\s+SUITABLE\s+FROM\s+\d{4}\s+UTC\s*/\s*TO\s+(\d{4})\s+UTC"#, cfp) { badge(airport + " From " + suitable + "Z To " + to + "Z", line) }
            }
            if let fir = FlightRules.capture(#"\[\s*FIR\s*\]\s*([A-Z]{3,5})\b"#, line.text), let time = firTimes[fir.uppercased()] {
                badge("FIR ENTRY " + time, line)
            }
            if line.page == sectionStarts["CFP PLAN"], FlightRules.contains(#"\bETA\b"#, line.text),
               let departureTime, let arrivalTime, let tripTime,
               let day = FlightRules.arrivalDay(departureTime, arrivalTime, tripTime) { badge(day, line) }
            if let from = FlightRules.capture(#"EXPECTED\s+FROM\s+([A-Z0-9]{3,6})\s+TO\s+[A-Z0-9]{3,6}\b"#, line.text),
               let to = FlightRules.capture(#"EXPECTED\s+FROM\s+[A-Z0-9]{3,6}\s+TO\s+([A-Z0-9]{3,6})\b"#, line.text),
               let start = wptTimes[from.uppercased()], let end = wptTimes[to.uppercased()] { badge(start + " ~ " + end, line) }
        }
        guard let output = document.dataRepresentation() else { throw Failure.exportFailed }
        var warnings: [String] = []
        if emptyPages > 0 { warnings.append("텍스트를 추출할 수 없는 \(emptyPages)페이지는 강조 처리를 건너뛰었습니다.") }
        return Result(data: output, markCount: markCount, badgeCount: badgeCount, warnings: warnings)
    }
}
