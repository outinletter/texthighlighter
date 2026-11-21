import Foundation
import PDFKit
import CoreText

@main
struct NativePDFEngineTests {
    static var checks = 0
    static func check(_ condition: Bool, _ message: String) {
        precondition(condition, message)
        checks += 1
    }
    static func pdf(_ pages: [[String]], shaded: Bool = false) -> Data {
        let buffer = NSMutableData()
        let consumer = CGDataConsumer(data: buffer)!
        var bounds = CGRect(x: 0, y: 0, width: 612, height: 792)
        let context = CGContext(consumer: consumer, mediaBox: &bounds, nil)!
        for strings in pages {
            context.beginPDFPage(nil)
            if shaded {
                context.setFillColor(gray: 0.8, alpha: 1)
                context.fill(CGRect(x: 25, y: 600, width: 550, height: 125))
            }
            for (index, string) in strings.enumerated() {
                context.textPosition = CGPoint(x: 40, y: 750 - index * 25)
                let font = CTFontCreateWithName("Helvetica" as CFString, 11, nil)
                let text = NSAttributedString(string: string, attributes: [NSAttributedString.Key(kCTFontAttributeName as String): font])
                CTLineDraw(CTLineCreateWithAttributedString(text), context)
            }
            context.endPDFPage()
        }
        context.closePDF()
        return buffer as Data
    }
    static func annotations(_ data: Data, type: String) -> [PDFAnnotation] {
        let doc = PDFDocument(data: data)!
        return (0..<doc.pageCount).flatMap { doc.page(at: $0)!.annotations }.filter { $0.type == type }
    }
    static func main() throws {
        setbuf(stdout, nil)
        check(FlightRules.dutyBadge("07.29") == nil, "Duty lower boundary")
        check(FlightRules.dutyBadge("07.30") == "REST TIME 05:00 (02:30)", "Duty two thirds")
        check(FlightRules.dutyBadge("11.30") == "REST TIME 05:45", "Duty half boundary")
        check(FlightRules.dutyBadge("12.60") == nil, "Invalid minutes rejected")
        check(FlightRules.isWeather("-SHRA"), "Combined weather code")
        check(!FlightRules.isWeather("TRACK"), "Ordinary word not weather")
        check(FlightRules.contains(FlightRules.wordPattern("RA"), "RA RAMP"), "Whole word positive")
        check(!FlightRules.contains(FlightRules.wordPattern("RA"), "TRACK RAMP"), "Whole word negative")
        check(FlightRules.contains(FlightRules.wordPattern("RESTRICT"), "RESTRICTED"), "Restriction suffix")
        check(FlightRules.arrivalDay("1800", "0530", "11.30") == "ARR +1 DAY (UTC)", "Arrival day rollover")
        check(FlightRules.arrivalDay("1800", "0630", "11.30") == nil, "Arrival mismatch not guessed")
        check(FlightRules.firTimes("EET/RKRR0030 RJJJ0700 SEL/ABCD", etd: "1800")["RJJJ"] == "0100Z+1", "FIR UTC day rollover")
        check(FlightRules.firTimes("EET/RKRR0030 SEL/ABCD RJJJ0700", etd: "1800")["RJJJ"] == nil, "EET stops at next field")
        let wpts = FlightRules.waypointTimes("KALNA E150 00.0 065 / 34 592 02.22 0377/\n43E60 E160 00.0 065 / 34 592 03.09 0479/\nREFILE FLT PLAN\nOTHER E160 00.0 065 / 34 592 05.00 0479/")
        check(wpts["KALNA"] == "02.22" && wpts["43E60"] == "03.09" && wpts["OTHER"] == nil, "Active route waypoint times")
        let source = pdf([["CFP PLAN", "TRIP 12345 11.30", "2ND PILOT", "MEL MELTING", "CUSTOM WORD", "ETD RKSI 1800Z ETA RJTT 2000Z"], ["NOTAM PACKAGE 1", "[DEP]RKSI/ICN", "RKSI A0001/26", "RWY CLOSED", "COMMENT) NO KE", "RKSI A0002/26", "RWY CLOSED"]])
        var options = EngineOptions()
        options.keywords = ["MEL"]
        let result = try PDFEngine.process(source, options: options)
        check(result.markCount == 2, "Whole word and applicable critical line only")
        check(result.badgeCount == 2, "Duty and departure badges")
        check(annotations(source, type: "Highlight").isEmpty, "Source PDF unchanged")
        let output = PDFDocument(data: result.data)!
        check(output.outlineRoot?.numberOfChildren == 2, "Section bookmarks generated")
        check(output.outlineRoot?.child(at: 1)?.numberOfChildren == 1, "Airport subbookmark")
        check(annotations(result.data, type: "FreeText").contains { $0.contents == "REST TIME 05:45" }, "Duty badge survives serialization")
        options.underline = true
        check(annotations(try PDFEngine.process(source, options: options).data, type: "Underline").count == 2, "Underline exports")
        options.badgesOnly = true
        let badgesOnly = try PDFEngine.process(source, options: options)
        check(badgesOnly.markCount == 0 && badgesOnly.badgeCount == 2, "Badge only disables all markers")
        options = EngineOptions(); options.keywords = ["CUSTOMWORD"]; options.customWords = ["CUSTOMWORD"]
        let custom = try PDFEngine.process(pdf([["CUSTOM WORD and other text"]]), options: options)
        check(custom.markCount == 1, "Custom fragmented text matching")
        options.customWholeLine = true
        let full = try PDFEngine.process(pdf([["CUSTOM WORD and other text"]]), options: options)
        check(annotations(full.data, type: "Highlight")[0].bounds.width > annotations(custom.data, type: "Highlight")[0].bounds.width, "Custom full line scope")
        options = EngineOptions(); options.keywords = ["MEL"]
        let crosspage = pdf([["NOTAM PACKAGE 3", "RKRR A0001/26", "MEL EXC"], ["SKED", "MEL", "RKRR A0002/26", "MEL"]], shaded: true)
        check(try PDFEngine.process(crosspage, options: options).markCount == 1, "EXC SKED entire item across pages")
        check(try PDFEngine.process(pdf([["NOTAM PACKAGE 3", "RKRR A0001/26", "MEL"]]), options: options).markCount == 0, "NOTAM 3 outside gray region suppressed")
        let shaded = try PDFEngine.process(pdf([["NOTAM PACKAGE 3", "RKRR A0001/26", "MEL"]], shaded: true), options: options)
        check(shaded.markCount == 1, "NOTAM 3 gray region accepted")
        let original = PDFDocument(data: source)!
        let root = PDFOutline(); let entry = PDFOutline(); entry.label = "Existing"
        entry.destination = PDFDestination(page: original.page(at: 0)!, at: CGPoint(x: 0, y: 750)); root.insertChild(entry, at: 0); original.outlineRoot = root
        options.keepBookmarks = true
        let preserved = try PDFEngine.process(original.dataRepresentation()!, options: options)
        check(PDFDocument(data: preserved.data)!.outlineRoot?.child(at: 0)?.label == "Existing", "Keep existing outline")
        do { _ = try PDFEngine.process(Data("not pdf".utf8), options: options); fatalError("Invalid PDF accepted") }
        catch PDFEngine.Failure.invalidPDF { checks += 1 }
        do { _ = try PDFEngine.process(pdf([[]]), options: options); fatalError("Blank PDF accepted") }
        catch PDFEngine.Failure.noText { checks += 1 }
        print("Native PDF engine: \(checks) checks passed")
    }
}
