import PDFKit
import CoreGraphics

/// Reads gray filled PDF rectangles in page coordinates; clips are never treated as fills.
/// The scanner also follows Form XObjects, including their transformation matrices.
final class PDFShading {
    private struct State {
        var transform = CGAffineTransform.identity
        var gray = false
        var components = 1
    }
    private final class ScanContext {
        var state = State()
        var stack: [State] = []
        var rectangles: [CGRect] = []
        var regions: [CGRect] = []
        var depth = 0
    }
    private var cache: [ObjectIdentifier: [CGRect]] = [:]

    func contains(_ bounds: CGRect, on page: PDFPage) -> Bool {
        regions(on: page).contains { region in
            region.insetBy(dx: -2, dy: -2).contains(bounds)
        }
    }

    func regions(on page: PDFPage) -> [CGRect] {
        let key = ObjectIdentifier(page)
        if cache[key] == nil {
            let context = ScanContext()
            if let reference = page.pageRef {
                Self.scan(CGPDFContentStreamCreateWithPage(reference), context: context)
            }
            cache[key] = context.regions
        }
        return cache[key] ?? []
    }

    private static func context(_ raw: UnsafeMutableRawPointer?) -> ScanContext {
        Unmanaged<ScanContext>.fromOpaque(raw!).takeUnretainedValue()
    }
    private static func numbers(_ scanner: CGPDFScannerRef, _ count: Int) -> [CGFloat]? {
        var result: [CGFloat] = []
        for _ in 0..<count {
            var value: CGPDFReal = 0
            guard CGPDFScannerPopNumber(scanner, &value) else { return nil }
            result.insert(CGFloat(value), at: 0)
        }
        return result
    }
    private static func scan(_ stream: CGPDFContentStreamRef, context: ScanContext) {
        guard context.depth < 20, let table = CGPDFOperatorTableCreate() else { return }
        CGPDFOperatorTableSetCallback(table, "q") { _, raw in
            let c = PDFShading.context(raw); c.stack.append(c.state)
        }
        CGPDFOperatorTableSetCallback(table, "Q") { _, raw in
            let c = PDFShading.context(raw); if let state = c.stack.popLast() { c.state = state }
        }
        CGPDFOperatorTableSetCallback(table, "cm") { scanner, raw in
            guard let v = PDFShading.numbers(scanner, 6) else { return }
            let c = PDFShading.context(raw)
            c.state.transform = CGAffineTransform(a: v[0], b: v[1], c: v[2], d: v[3], tx: v[4], ty: v[5]).concatenating(c.state.transform)
        }
        CGPDFOperatorTableSetCallback(table, "rg") { scanner, raw in
            guard let v = PDFShading.numbers(scanner, 3) else { return }
            PDFShading.context(raw).state.gray = abs(v[0] - v[1]) < 0.04 && abs(v[1] - v[2]) < 0.04 && v[0] > 0.5 && v[0] < 0.95
        }
        CGPDFOperatorTableSetCallback(table, "g") { scanner, raw in
            guard let v = PDFShading.numbers(scanner, 1)?.first else { return }
            PDFShading.context(raw).state.gray = v > 0.5 && v < 0.95
        }
        CGPDFOperatorTableSetCallback(table, "k") { scanner, raw in
            guard let v = PDFShading.numbers(scanner, 4) else { return }
            let rgb = v.prefix(3).map { (1 - $0) * (1 - v[3]) }
            PDFShading.context(raw).state.gray = abs(rgb[0] - rgb[1]) < 0.04 && abs(rgb[1] - rgb[2]) < 0.04 && rgb[0] > 0.5 && rgb[0] < 0.95
        }
        CGPDFOperatorTableSetCallback(table, "cs") { scanner, raw in
            var name: UnsafePointer<CChar>?
            let c = PDFShading.context(raw)
            c.state.gray = false
            c.state.components = 0
            guard CGPDFScannerPopName(scanner, &name), let name else { return }
            var space = String(cString: name)
            if let resource = CGPDFContentStreamGetResource(CGPDFScannerGetContentStream(scanner), "ColorSpace", name) {
                var array: CGPDFArrayRef?
                var resourceName: UnsafePointer<CChar>?
                if CGPDFObjectGetValue(resource, .name, &resourceName), let resourceName { space = String(cString: resourceName) }
                else if CGPDFObjectGetValue(resource, .array, &array), let array {
                    var type: UnsafePointer<CChar>?
                    if CGPDFArrayGetName(array, 0, &type), let type {
                        space = String(cString: type)
                        if space == "ICCBased" {
                            var profile: CGPDFStreamRef?
                            if CGPDFArrayGetStream(array, 1, &profile), let profile, let dictionary = CGPDFStreamGetDictionary(profile) {
                                var count: CGPDFInteger = 0
                                if CGPDFDictionaryGetInteger(dictionary, "N", &count) { c.state.components = count }
                            }
                        }
                    }
                }
            }
            if ["DeviceGray", "CalGray", "G"].contains(space) { c.state.components = 1 }
            if ["DeviceRGB", "CalRGB", "RGB"].contains(space) { c.state.components = 3 }
            if ["DeviceCMYK", "CMYK"].contains(space) { c.state.components = 4 }
        }
        let fillColor: CGPDFOperatorCallback = { scanner, raw in
            let c = PDFShading.context(raw)
            c.state.gray = false
            guard c.state.components > 0, let values = PDFShading.numbers(scanner, c.state.components) else { return }
            let rgb: [CGFloat]
            switch values.count {
            case 1: rgb = Array(repeating: values[0], count: 3)
            case 3: rgb = values
            case 4: rgb = values.prefix(3).map { (1 - $0) * (1 - values[3]) }
            default: return
            }
            c.state.gray = abs(rgb[0] - rgb[1]) < 0.04 && abs(rgb[1] - rgb[2]) < 0.04 && rgb[0] > 0.5 && rgb[0] < 0.95
        }
        CGPDFOperatorTableSetCallback(table, "sc", fillColor)
        CGPDFOperatorTableSetCallback(table, "scn", fillColor)
        CGPDFOperatorTableSetCallback(table, "re") { scanner, raw in
            guard let v = PDFShading.numbers(scanner, 4) else { return }
            let c = PDFShading.context(raw)
            c.rectangles.append(CGRect(x: v[0], y: v[1], width: v[2], height: v[3]).standardized.applying(c.state.transform))
        }
        let fill: CGPDFOperatorCallback = { _, raw in
            let c = PDFShading.context(raw)
            if c.state.gray { c.regions.append(contentsOf: c.rectangles.filter { $0.width >= 40 && $0.height >= 8 }) }
            c.rectangles.removeAll()
        }
        let discard: CGPDFOperatorCallback = { _, raw in PDFShading.context(raw).rectangles.removeAll() }
        for op in ["f", "F", "f*", "B", "B*", "b", "b*"] { CGPDFOperatorTableSetCallback(table, op, fill) }
        for op in ["n", "S", "s"] { CGPDFOperatorTableSetCallback(table, op, discard) }
        CGPDFOperatorTableSetCallback(table, "Do") { scanner, raw in
            var name: UnsafePointer<CChar>?
            guard CGPDFScannerPopName(scanner, &name), let name else { return }
            let parent = CGPDFScannerGetContentStream(scanner)
            guard let object = CGPDFContentStreamGetResource(parent, "XObject", name) else { return }
            var form: CGPDFStreamRef?
            guard CGPDFObjectGetValue(object, .stream, &form), let form else { return }
            guard let dictionary = CGPDFStreamGetDictionary(form) else { return }
            var subtype: UnsafePointer<CChar>?
            guard CGPDFDictionaryGetName(dictionary, "Subtype", &subtype), let subtype, String(cString: subtype) == "Form" else { return }
            let c = PDFShading.context(raw)
            let saved = c.state
            let savedStack = c.stack
            let savedRectangles = c.rectangles
            var matrix: CGPDFArrayRef?
            if CGPDFDictionaryGetArray(dictionary, "Matrix", &matrix), let matrix, CGPDFArrayGetCount(matrix) == 6 {
                var values = [CGPDFReal](repeating: 0, count: 6)
                for index in 0..<6 { CGPDFArrayGetNumber(matrix, index, &values[index]) }
                c.state.transform = CGAffineTransform(a: values[0], b: values[1], c: values[2], d: values[3], tx: values[4], ty: values[5]).concatenating(c.state.transform)
            }
            c.rectangles = []; c.stack = []; c.depth += 1
            var resources: CGPDFDictionaryRef?
            CGPDFDictionaryGetDictionary(dictionary, "Resources", &resources)
            PDFShading.scan(CGPDFContentStreamCreateWithStream(form, resources ?? dictionary, parent), context: c)
            c.depth -= 1; c.state = saved; c.stack = savedStack; c.rectangles = savedRectangles
        }
        let scanner = CGPDFScannerCreate(stream, table, Unmanaged.passUnretained(context).toOpaque())
        CGPDFScannerScan(scanner)
    }
}
