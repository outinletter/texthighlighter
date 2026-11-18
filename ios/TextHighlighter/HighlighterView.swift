import SwiftUI
import PDFKit
import UniformTypeIdentifiers

@MainActor
final class HighlighterModel: ObservableObject {
    @Published var source: Data?
    @Published var filename = "document.pdf"
    @Published var output: PDFDocument?
    @Published var exportURL: URL?
    @Published var busy = false
    @Published var status = "Engine ready. Select keywords and upload PDF to start."
    @Published var error: String?
    private var outputDirectory: URL?

    func invalidate() {
        output = nil
        exportURL = nil
        if let directory = outputDirectory { try? FileManager.default.removeItem(at: directory) }
        outputDirectory = nil
    }

    func load(_ url: URL) async {
        busy = true
        defer { busy = false }
        let access = url.startAccessingSecurityScopedResource()
        defer { if access { url.stopAccessingSecurityScopedResource() } }
        do {
            let data = try await Task.detached(priority: .userInitiated) { try Data(contentsOf: url) }.value
            guard let document = PDFDocument(data: data), document.pageCount > 0 else { throw PDFEngine.Failure.invalidPDF }
            guard !document.isLocked else { throw PDFEngine.Failure.lockedPDF }
            guard document.allowsCommenting else { throw PDFEngine.Failure.restrictedPDF }
            invalidate()
            source = data
            filename = url.lastPathComponent
            status = "\(filename) · \(document.pageCount)페이지"
        } catch { self.error = error.localizedDescription }
    }

    func run(_ options: EngineOptions) async {
        guard let source, !busy else { return }
        invalidate()
        busy = true
        status = "PDF 분석 및 네이티브 주석 생성 중…"
        do {
            let result = try await Task.detached(priority: .userInitiated) {
                try PDFEngine.process(source, options: options)
            }.value
            let directory = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
            outputDirectory = directory
            try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
            let name = (filename as NSString).deletingPathExtension + "_highlighted.pdf"
            let url = directory.appendingPathComponent(name)
            try result.data.write(to: url, options: .atomic)
            guard let document = PDFDocument(data: result.data) else { throw PDFEngine.Failure.invalidPDF }
            output = document
            exportURL = url
            status = "완료 · \(result.markCount)개 마커 · \(result.badgeCount)개 배지"
            if !result.warnings.isEmpty { status += "\n" + result.warnings.joined(separator: "\n") }
        } catch {
            invalidate()
            self.error = error.localizedDescription
            status = "처리하지 못했습니다. 원본 파일은 변경되지 않았습니다."
        }
        busy = false
    }
}

struct HighlighterView: View {
    @StateObject private var model = HighlighterModel()
    @State private var options = EngineOptions()
    @State private var importing = false
    @State private var customInput = ""
    @State private var wordsExpanded = false
    @State private var sheet: HighlighterSheet?
    @AppStorage("native.highlighter.options") private var savedOptions = Data()

    private var canRun: Bool { model.source != nil && (options.badgesOnly || !options.keywords.isEmpty) && !model.busy }

    var body: some View {
        ScrollView {
            VStack(spacing: 0) {
                header
                VStack(spacing: 16) {
                    uploadCard
                    settingsCard.zIndex(1)
                    customCard
                    engineCard
                    if let url = model.exportURL { saveCard(url) }
                }
                .padding(.horizontal, 12).padding(.top, 16).padding(.bottom, 32)
                .frame(maxWidth: 664)
                footer
            }
            .frame(maxWidth: .infinity)
        }
        .background(HighlighterTheme.background.ignoresSafeArea())
        .preferredColorScheme(.dark)
        .tint(HighlighterTheme.blue)
        .scrollDismissesKeyboard(.interactively)
        .disabled(model.busy)
        .fileImporter(isPresented: $importing, allowedContentTypes: [.pdf]) { result in
            switch result {
            case .success(let url): Task { await model.load(url) }
            case .failure(let error): model.error = error.localizedDescription
            }
        }
        .sheet(item: $sheet) { item in
            switch item {
            case .preview(let document): PDFPreview(document: document)
            case .offline: OfflineUsageView()
            }
        }
        .alert("PDF 처리 오류", isPresented: Binding(get: { model.error != nil }, set: { if !$0 { model.error = nil } })) {
            Button("확인", role: .cancel) { model.error = nil }
        } message: { Text(model.error ?? "") }
        .onAppear {
            if let saved = try? JSONDecoder().decode(EngineOptions.self, from: savedOptions) { options = saved }
        }
        .onChange(of: options) { value in
            savedOptions = (try? JSONEncoder().encode(value)) ?? Data()
            model.invalidate()
            if model.source != nil { model.status = "설정이 변경되었습니다. RUN ENGINE을 눌러 다시 처리하세요." }
        }
    }

    private var header: some View {
        VStack(spacing: 7) {
            (Text("TEXT ").foregroundColor(.white) + Text("HIGHLIGHTER").foregroundColor(HighlighterTheme.blue))
                .font(.system(size: 24, weight: .heavy)).tracking(0.4)
                .minimumScaleFactor(0.75).lineLimit(1)
                .accessibilityAddTraits(.isHeader)
            Text("Offline Ready Smart Text Highlighter & Route Matcher")
                .font(.system(size: 12)).foregroundStyle(HighlighterTheme.muted)
                .multilineTextAlignment(.center)
        }
        .frame(maxWidth: .infinity).padding(.horizontal, 16).padding(.vertical, 24)
        .background(HighlighterTheme.panel)
        .overlay(alignment: .bottom) { Rectangle().fill(HighlighterTheme.border).frame(height: 1) }
    }

    private var uploadCard: some View {
        HighlighterCard {
            cardTitle("1. PDF FLIGHT PACKAGE")
            Button { wordsExpanded = false; importing = true } label: {
                HStack(spacing: 12) {
                    VStack(alignment: .leading, spacing: 4) {
                        Text("Click here or drag & drop your flight package PDF")
                            .font(.system(size: 12.5, weight: .semibold)).foregroundStyle(HighlighterTheme.text)
                        Text("Supported format: .pdf only").font(.system(size: 10.5)).foregroundStyle(HighlighterTheme.dim)
                        if model.source != nil {
                            Text(model.filename).font(.system(size: 11.5, weight: .semibold)).foregroundStyle(HighlighterTheme.green)
                                .lineLimit(3)
                        }
                    }
                    Spacer(minLength: 0)
                    Text("Browse").font(.system(size: 11, weight: .semibold)).foregroundStyle(HighlighterTheme.blue)
                        .padding(.horizontal, 16).padding(.vertical, 10)
                        .background(HighlighterTheme.blue.opacity(0.1))
                        .clipShape(RoundedRectangle(cornerRadius: 6))
                        .overlay(RoundedRectangle(cornerRadius: 6).stroke(HighlighterTheme.blue))
                }
                .padding(.horizontal, 16).padding(.vertical, 24)
                .background(model.source == nil ? HighlighterTheme.panel : HighlighterTheme.green.opacity(0.05))
                .clipShape(RoundedRectangle(cornerRadius: 10))
                .overlay(RoundedRectangle(cornerRadius: 10).stroke(model.source == nil ? HighlighterTheme.controlBorder : HighlighterTheme.green,
                    style: StrokeStyle(lineWidth: 2, dash: model.source == nil ? [6, 4] : [])))
            }
            .buttonStyle(.plain).accessibilityIdentifier("browsePDF")
            .dropDestination(for: URL.self) { urls, _ in
                guard !model.busy, let url = urls.first, url.pathExtension.lowercased() == "pdf" else { return false }
                Task { await model.load(url) }
                return true
            }
        }
    }

    private var settingsCard: some View {
        HighlighterCard {
            HStack(spacing: 10) {
                cardTitle("2. HIGHLIGHT & BOOKMARK SETTINGS")
                Spacer(minLength: 0)
                Button { wordsExpanded.toggle() } label: {
                    HStack(spacing: 5) {
                        Text("Select Words").font(.system(size: 11))
                        Text("\(options.keywords.count)").font(.system(size: 10, weight: .bold))
                            .padding(.horizontal, 6).padding(.vertical, 2)
                            .background(HighlighterTheme.blue).clipShape(Capsule())
                        Image(systemName: wordsExpanded ? "chevron.up" : "chevron.down").font(.system(size: 8))
                    }
                    .foregroundStyle(HighlighterTheme.text).padding(.horizontal, 9).frame(minHeight: 36)
                    .background(HighlighterTheme.panel).clipShape(RoundedRectangle(cornerRadius: 8))
                    .overlay(RoundedRectangle(cornerRadius: 8).stroke(HighlighterTheme.controlBorder))
                }.buttonStyle(.plain).accessibilityIdentifier("selectWords")
            }
            VStack(spacing: 12) {
                BinarySetting(title: "Processing Mode", first: "Keywords", second: "Badge Only", selection: $options.badgesOnly)
                BinarySetting(title: "Bookmarks", first: "Create", second: "Keep", selection: $options.keepBookmarks)
                BinarySetting(title: "Marker Style", first: "Highlight", second: "Underline", selection: $options.underline)
            }
            Rectangle().fill(HighlighterTheme.border).frame(height: 1).padding(.top, 2)
            HStack(spacing: 10) {
                Text("Marker Color").font(.system(size: 11, weight: .bold)).foregroundStyle(HighlighterTheme.muted)
                ForEach(MarkerColor.allCases) { color in
                    Button { options.color = color } label: {
                        Circle().fill(Color(uiColor: color.uiColor)).frame(width: 24, height: 24)
                            .overlay(Circle().stroke(options.color == color ? .white : .clear, lineWidth: 2))
                            .frame(width: 32, height: 36)
                    }.buttonStyle(.plain)
                        .accessibilityLabel("\(color.rawValue) marker")
                        .accessibilityAddTraits(options.color == color ? [.isSelected] : [])
                }
                Spacer(minLength: 0)
            }
        }
        .overlay(alignment: .topTrailing) {
            if wordsExpanded {
                InlineKeywordPicker(options: $options)
                    .frame(width: 240, height: 220).padding(.trailing, 16).offset(y: 58)
                    .shadow(color: .black.opacity(0.5), radius: 12, y: 6)
            }
        }
    }

    private var customCard: some View {
        HighlighterCard {
            ViewThatFits(in: .horizontal) {
                HStack(spacing: 8) {
                    cardTitle("3. ADD CUSTOM WORD TAGS")
                    Spacer(minLength: 0)
                    BinarySetting(first: "Words", second: "Full Line", selection: $options.customWholeLine).fixedSize(horizontal: true, vertical: false)
                }
                VStack(alignment: .leading, spacing: 10) {
                    cardTitle("3. ADD CUSTOM WORD TAGS")
                    BinarySetting(first: "Words", second: "Full Line", selection: $options.customWholeLine).frame(maxWidth: 210)
                }
            }
            HStack(spacing: 6) {
                TextField("Enter custom words or phrases (comma separated)", text: $customInput)
                    .font(.system(size: 12.5)).textInputAutocapitalization(.characters).autocorrectionDisabled()
                    .padding(.horizontal, 10).frame(minHeight: 40).background(HighlighterTheme.panel)
                    .clipShape(RoundedRectangle(cornerRadius: 8))
                    .overlay(RoundedRectangle(cornerRadius: 8).stroke(HighlighterTheme.controlBorder))
                    .onSubmit(addCustomWords)
                Button("Add", action: addCustomWords)
                    .font(.system(size: 12.5, weight: .semibold)).foregroundStyle(.white)
                    .padding(.horizontal, 14).frame(minHeight: 40)
                    .background(HighlighterTheme.blue).clipShape(RoundedRectangle(cornerRadius: 8))
                    .buttonStyle(.plain)
                    .disabled(customInput.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
            }
            if !options.customWords.isEmpty {
                ScrollView {
                    LazyVGrid(columns: [GridItem(.adaptive(minimum: 85), spacing: 4)], alignment: .leading, spacing: 4) {
                        ForEach(options.customWords, id: \.self) { word in
                            HStack(spacing: 4) {
                                Text(word).font(.system(size: 10, weight: .semibold))
                                Button {
                                    options.customWords.removeAll { $0 == word }; options.keywords.remove(word)
                                } label: { Image(systemName: "xmark").font(.system(size: 10)) }
                                .accessibilityLabel("\(word) 삭제")
                            }
                            .padding(7).foregroundStyle(Color(uiColor: options.color.uiColor))
                            .background(Color(uiColor: options.color.uiColor).opacity(0.15))
                            .clipShape(RoundedRectangle(cornerRadius: 5))
                        }
                    }.padding(8)
                }
                .frame(height: 160).background(HighlighterTheme.panel).clipShape(RoundedRectangle(cornerRadius: 8))
                .overlay(RoundedRectangle(cornerRadius: 8).stroke(HighlighterTheme.controlBorder))
            }
        }
    }

    private var engineCard: some View {
        HighlighterCard {
            cardTitle("4. RUN SYSTEM ENGINE")
            Button {
                wordsExpanded = false
                Task { await model.run(options) }
            } label: {
                Text(model.busy ? "Processing locally…" : "RUN ENGINE")
                    .font(.system(size: 13, weight: .bold)).tracking(0.5)
                    .foregroundStyle(canRun ? .white : HighlighterTheme.dim)
                    .frame(maxWidth: .infinity, minHeight: 44)
                    .background(canRun ? Color(hex: 0x2563eb) : HighlighterTheme.controlBorder)
                    .clipShape(RoundedRectangle(cornerRadius: 8))
            }.buttonStyle(.plain).disabled(!canRun).accessibilityIdentifier("runEngine")
            HStack(alignment: .top, spacing: 8) {
                if model.busy { ProgressView().controlSize(.mini) }
                else { Circle().fill(model.exportURL == nil ? HighlighterTheme.blue : HighlighterTheme.green).frame(width: 8, height: 8).padding(.top, 3) }
                Text(model.status).font(.system(size: 11.5)).foregroundStyle(model.exportURL == nil ? HighlighterTheme.muted : HighlighterTheme.green)
                    .frame(maxWidth: .infinity, alignment: .leading).accessibilityIdentifier("engineStatus")
            }
            .padding(12).frame(minHeight: 40).background(HighlighterTheme.panel)
            .clipShape(RoundedRectangle(cornerRadius: 8))
            .overlay(RoundedRectangle(cornerRadius: 8).stroke(HighlighterTheme.border))
        }
    }

    private func saveCard(_ url: URL) -> some View {
        HighlighterCard {
            cardTitle("5. SAVE OPTIMIZED DOCUMENT")
            Text("Tap the button below to save to your local drive or share/AirDrop with your crew.")
                .font(.system(size: 11)).foregroundStyle(HighlighterTheme.muted)
            ShareLink(item: url) {
                Text("DOWNLOAD PDF FILE").font(.system(size: 13, weight: .bold))
                    .foregroundStyle(Color(hex: 0x0c4a6e)).frame(maxWidth: .infinity, minHeight: 44)
                    .background(Color(hex: 0x93c5fd)).clipShape(RoundedRectangle(cornerRadius: 8))
            }.buttonStyle(.plain)
            Button {
                if let document = model.output { sheet = .preview(document) }
            } label: { Label("Preview PDF", systemImage: "doc.text.magnifyingglass").modifier(SupportButtonStyle()) }
                .buttonStyle(.plain)
        }
    }

    private var footer: some View {
        VStack(spacing: 8) {
            HStack(spacing: 10) {
                Link("Feedback Survey", destination: URL(string: "https://forms.gle/rNLY3WBZeRrvBzCc7")!)
                    .modifier(SupportButtonStyle())
                Button("Offline Usage") { wordsExpanded = false; sheet = .offline }
                    .modifier(SupportButtonStyle())
            }.buttonStyle(.plain)
            .frame(maxWidth: 664).padding(.horizontal, 12).padding(.bottom, 12)
            Text("참고용 보조 도구입니다. 공식 운항 판단은 원본 문서를 기준으로 하세요. / Reference aid only. Always verify against the original documents.")
                .font(.system(size: 10)).foregroundStyle(HighlighterTheme.muted)
                .multilineTextAlignment(.center).padding(.horizontal, 16)
            footerCopyright
        }
        .frame(maxWidth: .infinity).padding(.top, 24).padding(.bottom, 32)
        .background(Color(hex: 0x070b13))
        .overlay(alignment: .top) { Rectangle().fill(HighlighterTheme.border).frame(height: 1) }
    }

    private var footerCopyright: some View {
        Text("© 2026 EFB Systems  |  v\(Bundle.main.object(forInfoDictionaryKey: "CFBundleShortVersionString") as? String ?? "1.0.0") (\(Bundle.main.object(forInfoDictionaryKey: "CFBundleVersion") as? String ?? ""))")
            .font(.system(size: 11)).foregroundStyle(HighlighterTheme.dim)
    }

    private func cardTitle(_ title: String) -> some View {
        Text(title).font(.system(size: 11, weight: .bold)).tracking(0.6)
            .foregroundStyle(Color(hex: 0xa8c4ef)).fixedSize(horizontal: false, vertical: true)
            .accessibilityAddTraits(.isHeader)
    }

    private func addCustomWords() {
        let words = customInput.components(separatedBy: CharacterSet(charactersIn: ",\n"))
            .map { $0.trimmingCharacters(in: .whitespacesAndNewlines).uppercased() }.filter { !$0.isEmpty }
        for word in words {
            if !options.customWords.contains(word) && !EngineOptions.presets.contains(word) { options.customWords.append(word) }
            options.keywords.insert(word)
        }
        customInput = ""
    }
}

private enum HighlighterTheme {
    static let background = Color(hex: 0x0b0f19)
    static let card = Color(hex: 0x111827)
    static let panel = Color(hex: 0x0f172a)
    static let border = Color(hex: 0x1e293b)
    static let controlBorder = Color(hex: 0x334155)
    static let text = Color(hex: 0xcbd5e1)
    static let muted = Color(hex: 0x94a3b8)
    static let dim = Color(hex: 0x64748b)
    static let blue = Color(hex: 0x3b82f6)
    static let green = Color(hex: 0x10b981)
}

private extension Color {
    init(hex: UInt32) {
        self.init(.sRGB, red: Double((hex >> 16) & 255) / 255, green: Double((hex >> 8) & 255) / 255, blue: Double(hex & 255) / 255, opacity: 1)
    }
}

private struct HighlighterCard<Content: View>: View {
    @ViewBuilder let content: () -> Content
    var body: some View {
        VStack(alignment: .leading, spacing: 12, content: content)
            .frame(maxWidth: .infinity, alignment: .leading).padding(16)
            .background(HighlighterTheme.card).clipShape(RoundedRectangle(cornerRadius: 12))
            .overlay(RoundedRectangle(cornerRadius: 12).stroke(HighlighterTheme.border))
    }
}

private struct BinarySetting: View {
    var title: String? = nil
    let first: String
    let second: String
    @Binding var selection: Bool
    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            if let title { Text(title).font(.system(size: 11, weight: .semibold)).foregroundStyle(HighlighterTheme.muted) }
            HStack(spacing: 2) {
                choice(first, value: false)
                choice(second, value: true)
            }
            .padding(3).background(HighlighterTheme.panel).clipShape(RoundedRectangle(cornerRadius: 8))
            .overlay(RoundedRectangle(cornerRadius: 8).stroke(HighlighterTheme.controlBorder))
            .accessibilityElement(children: .contain).accessibilityLabel(title ?? "Custom word scope")
        }
    }
    private func choice(_ text: String, value: Bool) -> some View {
        Button { selection = value } label: {
            Text(text).font(.system(size: 11)).foregroundStyle(selection == value ? .white : HighlighterTheme.muted)
                .frame(maxWidth: .infinity, minHeight: 32).padding(.horizontal, 10)
                .background(selection == value ? Color(hex: 0x2563eb) : .clear)
                .clipShape(RoundedRectangle(cornerRadius: 5))
        }.buttonStyle(.plain).accessibilityAddTraits(selection == value ? [.isSelected] : [])
    }
}

private struct InlineKeywordPicker: View {
    @Binding var options: EngineOptions
    private var words: [String] { EngineOptions.presets + options.customWords }
    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 0) {
                Text("NOTAM KEYWORDS").font(.system(size: 9, weight: .bold)).tracking(1)
                    .foregroundStyle(HighlighterTheme.dim).padding(12)
                Button(options.keywords.count == Set(words).count ? "Deselect All" : "Select All") {
                    options.keywords = options.keywords.count == Set(words).count ? [] : Set(words)
                }
                .font(.system(size: 11)).frame(maxWidth: .infinity, minHeight: 32)
                .background(HighlighterTheme.blue.opacity(0.12)).clipShape(RoundedRectangle(cornerRadius: 4))
                .padding(.horizontal, 12).padding(.bottom, 6)
                ForEach(words, id: \.self) { word in
                    Button {
                        if options.keywords.contains(word) { options.keywords.remove(word) }
                        else { options.keywords.insert(word) }
                    } label: {
                        HStack(spacing: 8) {
                            Image(systemName: options.keywords.contains(word) ? "checkmark.square.fill" : "square")
                                .foregroundStyle(options.keywords.contains(word) ? HighlighterTheme.blue : HighlighterTheme.muted)
                            Text(word).font(.system(size: 12.5))
                            Spacer(minLength: 0)
                        }.padding(.horizontal, 12).frame(minHeight: 36).contentShape(Rectangle())
                    }
                    .buttonStyle(.plain).accessibilityAddTraits(options.keywords.contains(word) ? [.isSelected] : [])
                }
            }.padding(.vertical, 4)
        }
        .foregroundStyle(HighlighterTheme.text).background(HighlighterTheme.border)
        .clipShape(RoundedRectangle(cornerRadius: 12))
        .overlay(RoundedRectangle(cornerRadius: 12).stroke(HighlighterTheme.controlBorder))
    }
}

private struct SupportButtonStyle: ViewModifier {
    func body(content: Content) -> some View {
        content.font(.system(size: 12, weight: .semibold)).foregroundStyle(HighlighterTheme.text)
            .frame(maxWidth: .infinity, minHeight: 40).background(HighlighterTheme.panel)
            .clipShape(RoundedRectangle(cornerRadius: 8))
            .overlay(RoundedRectangle(cornerRadius: 8).stroke(HighlighterTheme.controlBorder))
    }
}

private enum HighlighterSheet: Identifiable {
    case preview(PDFDocument), offline
    var id: String {
        switch self { case .preview: return "preview"; case .offline: return "offline" }
    }
}

private struct OfflineUsageView: View {
    @Environment(\.dismiss) private var dismiss
    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 18) {
                    Text("인터넷 없이 사용하기").font(.title2.bold())
                    Text("이 iOS 앱은 설치 후 인터넷 연결 없이 PDF를 처리할 수 있습니다.")
                    Text("1. 파일 앱에서 사용할 PDF를 ‘나의 iPhone’에 미리 저장하세요. iCloud에만 있는 파일은 오프라인에서 내려받을 수 없습니다.")
                    Text("2. Browse를 눌러 PDF를 선택하고 키워드와 마커를 설정하세요.")
                    Text("3. RUN ENGINE으로 처리한 뒤 DOWNLOAD PDF FILE에서 파일 저장 또는 공유를 선택하세요.")
                    Text("Feedback Survey 링크는 인터넷 연결이 필요합니다.")
                        .foregroundStyle(.secondary)
                }.padding(24)
            }
            .navigationTitle("Offline Usage").navigationBarTitleDisplayMode(.inline)
            .toolbar { ToolbarItem(placement: .confirmationAction) { Button("닫기") { dismiss() } } }
        }.preferredColorScheme(.dark)
    }
}

private final class LimitedPDFView: PDFView {
    override func layoutSubviews() {
        super.layoutSubviews()
        let fit = scaleFactorForSizeToFit
        guard fit > 0 else { return }
        minScaleFactor = fit * 0.7
        maxScaleFactor = fit * 1.3
    }
}

private final class PDFViewBox { let view = LimitedPDFView() }

private struct NativePDFView: UIViewRepresentable {
    let document: PDFDocument
    let box: PDFViewBox
    func makeUIView(context: Context) -> PDFView {
        let view = box.view
        view.autoScales = true
        view.displayMode = .singlePageContinuous
        view.document = document
        return view
    }
    func updateUIView(_ view: PDFView, context: Context) {
        if view.document !== document { view.document = document }
    }
}

private struct BookmarkRow: Identifiable {
    let outline: PDFOutline
    let depth: Int
    let hasChildren: Bool
    var id: ObjectIdentifier { ObjectIdentifier(outline) }
}

private struct PDFPreview: View {
    let document: PDFDocument
    @Environment(\.dismiss) private var dismiss
    @State private var box = PDFViewBox()
    @State private var showBookmarks = true
    @State private var expanded = Set<ObjectIdentifier>()
    @State private var panelWidth: CGFloat = 240
    @State private var dragStart: CGFloat?

    private var hasBookmarks: Bool { (document.outlineRoot?.numberOfChildren ?? 0) > 0 }

    private var rows: [BookmarkRow] {
        guard let root = document.outlineRoot else { return [] }
        var result: [BookmarkRow] = []
        func walk(_ node: PDFOutline, _ depth: Int) {
            for i in 0..<node.numberOfChildren {
                guard let child = node.child(at: i) else { continue }
                result.append(BookmarkRow(outline: child, depth: depth, hasChildren: child.numberOfChildren > 0))
                if expanded.contains(ObjectIdentifier(child)) { walk(child, depth + 1) }
            }
        }
        walk(root, 0)
        return result
    }

    var body: some View {
        NavigationStack {
            GeometryReader { geo in
                HStack(spacing: 0) {
                    if showBookmarks && hasBookmarks {
                        bookmarkPanel
                            .frame(width: min(max(panelWidth, 160), geo.size.width * 0.6))
                        Rectangle().fill(Color.gray.opacity(0.35)).frame(width: 6)
                            .overlay(Capsule().fill(Color.gray).frame(width: 2, height: 36))
                            .contentShape(Rectangle())
                            .gesture(DragGesture(minimumDistance: 1).onChanged { value in
                                if dragStart == nil { dragStart = panelWidth }
                                panelWidth = min(max((dragStart ?? panelWidth) + value.translation.width, 160), geo.size.width * 0.6)
                            }.onEnded { _ in dragStart = nil })
                            .accessibilityLabel("북마크 패널 크기 조절")
                    }
                    NativePDFView(document: document, box: box)
                        .clipped()
                }
            }
            .navigationTitle("PDF 미리보기").navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    if hasBookmarks {
                        Button { showBookmarks.toggle() } label: { Image(systemName: "list.bullet.indent") }
                            .accessibilityLabel("북마크 패널 열기/닫기")
                    }
                }
                ToolbarItem(placement: .confirmationAction) { Button("닫기") { dismiss() } }
            }
        }
    }

    private var bookmarkPanel: some View {
        List(rows) { row in
            HStack(spacing: 4) {
                if row.hasChildren {
                    Button {
                        if expanded.contains(row.id) { expanded.remove(row.id) } else { expanded.insert(row.id) }
                    } label: {
                        Image(systemName: expanded.contains(row.id) ? "chevron.down" : "chevron.right")
                            .font(.system(size: 11, weight: .semibold)).frame(width: 22, height: 28)
                    }.buttonStyle(.plain)
                } else {
                    Spacer().frame(width: 22)
                }
                Button {
                    if let destination = row.outline.destination { box.view.go(to: destination) }
                    else if let action = row.outline.action as? PDFActionGoTo { box.view.go(to: action.destination) }
                } label: {
                    Text(row.outline.label ?? "").font(.system(size: 13)).multilineTextAlignment(.leading)
                        .frame(maxWidth: .infinity, alignment: .leading)
                }.buttonStyle(.plain)
            }
            .padding(.leading, CGFloat(row.depth) * 14)
            .listRowInsets(EdgeInsets(top: 0, leading: 8, bottom: 0, trailing: 8))
        }
        .listStyle(.plain)
        .clipped()
        .highPriorityGesture(TapGesture(count: 2).onEnded { })
    }
}
