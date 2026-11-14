-- Only loads a locally generated edit plan with allowlisted renderer options.
local function check(value, message)
    if not value then error(message, 2) end
    return value
end
local function items(result)
    local list = {}
    for key, value in pairs(result or {}) do
        if type(key) == "number" then list[#list+1] = value end
    end
    return list
end
local function round(value) return math.floor(value + 0.5) end
local function write_status(message)
    local handle = check(fusion:OpenFile(ready, 2), "Cannot write preparation status")
    handle:WriteLine(message)
    handle:Close()
end
local function prepare()
    local instance = check(resolve or bmd.scriptapp("Resolve"), "Resolve is not available")
    local manager = check(instance:GetProjectManager(), "Resolve project manager is unavailable")
    check((manager:GetCurrentDatabase() or {}).DbType == "Disk", "Select a local Resolve project library")
    local project = check(manager:CreateProject(job.title), "Cannot create a fresh Resolve project")
    check(project:SetSettings({timelineFrameRate="30"}), "Cannot set 30 fps")
    check(project:SetSettings({timelinePlaybackFrameRate="30", timelineResolutionWidth="1080",
        timelineResolutionHeight="1920"}), "Cannot set the vertical canvas")
    local pool = check(project:GetMediaPool(), "Missing Media Pool")
    local timeline = check(pool:CreateEmptyTimeline(job.title), "Cannot create studio timeline")
    check(project:SetCurrentTimeline(timeline), "Cannot select the studio timeline")
    check(instance:OpenPage("edit"), "Cannot open the Edit page")
    local first_frame = timeline:GetStartFrame()
    local media = {}
    local function place(shot, first, last, record, track, media_type)
        local clip = media[shot.path]
        if not clip then
            clip = check(items(pool:ImportMedia({shot.path}))[1], "Cannot import an uploaded clip")
            media[shot.path] = clip
        end
        local fps = tonumber(clip:GetClipProperty("FPS"))
        local resolution = clip:GetClipProperty("Resolution")
        check(fps and fps > 0 and type(resolution) == "string" and resolution:match("%d+%s*[xX]%s*%d+"),
            "Resolve cannot decode the uploaded picture")
        local placed = items(pool:AppendToTimeline({{mediaPoolItem=clip,
            startFrame=round(first * fps / 30), endFrame=round(last * fps / 30),
            recordFrame=first_frame + record, trackIndex=track, mediaType=media_type}}))
        check(#placed > 0, "Cannot place an uploaded source")
    end
    local function comp_on(item)
        local comp = check(item:AddFusionComp(), "Cannot create a Fusion composition")
        return comp, check(comp:FindTool("MediaOut1"), "Missing Fusion MediaOut1")
    end
    local expected_audio = 0
    for index, shot in ipairs(job.shots) do
        local cursor = first_frame + shot.record
        place(shot, shot.first, shot.last, shot.record, 1, shot.audio == 0 and 1 or nil)
        if shot.audio == 1 and (tonumber(media[shot.path]:GetClipProperty("Audio Ch")) or 0) > 0 then
            expected_audio = expected_audio + 1
        end
        local clip
        for _, item in ipairs(items(timeline:GetItemListInTrack("video", 1))) do
            if item:GetStart() == cursor then clip = item; break end
        end
        check(clip and clip:GetDuration() == shot.last - shot.first, "Resolve rounded a verified clip interval")
        if job.lut ~= "" then
            local comp, out = comp_on(clip)
            local source = check(comp:FindTool("MediaIn1"), "Missing Fusion media input")
            local lut = check(comp:AddTool("FileLUT"), "Cannot add FileLUT")
            lut:SetInput("LUTFile", job.lut)
            check(lut:GetInput("LUTFile") == job.lut, "Resolve rejected the LUT path")
            lut:ConnectInput("Input", source:FindMainOutput(1))
            out:ConnectInput("Input", lut:FindMainOutput(1))
        end
        if job.fade > 0 then
            local fades = {FadeIn=index > 1 and job.fade or 0, FadeOut=index < #job.shots and job.fade or 0}
            check(clip:SetFades(fades), "Resolve rejected the transition fades")
            local applied = clip:GetFades()
            check(applied and applied.FadeIn == fades.FadeIn and applied.FadeOut == fades.FadeOut,
                "Resolve changed the requested transition")
        end
    end
    check(#items(timeline:GetItemListInTrack("audio", 1)) >= expected_audio, "Resolve dropped camera audio")
    for _, bed in ipairs(job.audioBeds or {}) do
        local track = 1
        if bed.role ~= "program" then
            check(timeline:AddTrack("audio", "stereo"), "Cannot add a soundtrack track")
            track = timeline:GetTrackCount("audio")
        end
        local media_item = check(items(pool:ImportMedia({bed.path}))[1], "Cannot import prepared sound")
        local audio = check(items(pool:AppendToTimeline({{mediaPoolItem=media_item, mediaType=2, trackIndex=track,
            recordFrame=first_frame + bed.record, startFrame=0, endFrame=bed.frames}}))[1], "Cannot insert sound")
        check(audio:GetStart() == first_frame + bed.record and audio:GetDuration() == bed.frames,
            "Resolve rounded the prepared soundtrack")
        if bed.fadeIn > 0 or bed.fadeOut > 0 then
            check(audio:SetFades({FadeIn=bed.fadeIn, FadeOut=bed.fadeOut}), "Resolve rejected the soundtrack fades")
            local actual = audio:GetFades()
            check(actual and actual.FadeIn == bed.fadeIn and actual.FadeOut == bed.fadeOut,
                "Resolve changed the soundtrack fades")
        end
    end
    if #job.captions > 0 then
        local family = fusion.FontManager:GetFontList()[job.font]
        check(family and family[job.weight], "Install the selected caption font in Resolve: " .. job.font .. " " .. job.weight)
        check(timeline:AddTrack("video"), "Cannot add a caption track")
        local expected_captions = 0
        for _, shot in ipairs(job.shots) do
            for _, cue in ipairs(job.captions) do
                local start = math.max(cue.first, shot.record)
                local finish = math.min(cue.last, shot.record + shot.last - shot.first)
                if finish > start then
                    place(shot, shot.first + start - shot.record, shot.first + finish - shot.record, start, 2, 1)
                    local caption
                    for _, item in ipairs(items(timeline:GetItemListInTrack("video", 2))) do
                        if item:GetStart() == first_frame + start then caption = item; break end
                    end
                    check(caption and caption:GetDuration() == finish - start, "Resolve rounded a caption interval")
                    local comp, out = comp_on(caption)
                    local render_start = check(comp:GetAttrs().COMPN_RenderStart, "Missing caption start frame")
                    local function text_layer(text, base, y, color)
                        local title = check(comp:AddTool("TextPlus"), "Cannot add Text+")
                        title:SetInput("StyledText", text)
                        title:SetInput("Font", job.font)
                        title:SetInput("Style", job.weight)
                        title:SetInput("Red1", color[1]/255)
                        title:SetInput("Green1", color[2]/255)
                        title:SetInput("Blue1", color[3]/255)
                        local size = check(title.Size, "Missing Text+ size")
                        local center = check(title.Center, "Missing Text+ center")
                        size:SetExpression(string.format("%.7f*(1+0.10*math.max(0,1-(time-(%d))/3))", base, render_start))
                        center:SetExpression(string.format("Point(0.5,%.7f+0.010*math.min(1,math.max(0,(time-(%d))/3)))",
                            y, render_start))
                        check(title:GetInput("StyledText") == text, "Resolve changed the caption text")
                        local size_start, size_end = title:GetInput("Size", render_start), title:GetInput("Size", render_start+3)
                        check(size_start and size_end and size_start > size_end, "Fusion caption pop did not evaluate")
                        local a, b = title:GetInput("Center", render_start), title:GetInput("Center", render_start+3)
                        check(a and b and a[2] and b[2] and b[2] > a[2], "Fusion caption lift did not evaluate")
                        return title:FindMainOutput(1)
                    end
                    local accent = cue.accent or ""
                    local render = text_layer(cue.text, job.size / 1080, accent == "" and 0.25 or 0.286,
                        {0xF3,0xEF,0xE7})
                    if accent ~= "" then
                        local detail = text_layer(accent, 1.16 * job.size / 1080, 0.235, {0xF4,0xCC,0x82})
                        local merge = check(comp:AddTool("Merge"), "Cannot add caption accent")
                        merge:ConnectInput("Background", render)
                        merge:ConnectInput("Foreground", detail)
                        render = merge:FindMainOutput(1)
                    end
                    out:ConnectInput("Input", render)
                    expected_captions = expected_captions + 1
                end
            end
        end
        check(#items(timeline:GetItemListInTrack("video", 2)) == expected_captions, "Resolve dropped a caption")
    end
    check(timeline:GetEndFrame() - first_frame == job.frames, "Resolve changed the verified duration")
    local codec
    for label, id in pairs(project:GetRenderCodecs("mp4") or {}) do
        if (tostring(label) .. tostring(id)):lower():gsub("[^a-z0-9]", ""):find("h264", 1, true) then
            codec = id
            break
        end
    end
    check(codec and project:SetCurrentRenderFormatAndCodec("mp4", codec), "H.264 MP4 unavailable")
    check(project:SetCurrentRenderMode(1), "Cannot set single-clip export")
    check(project:SetRenderSettings({SelectAllFrames=true}), "Cannot set full-timeline export")
    check(project:SetRenderSettings({ExportVideo=true, ExportAudio=true}), "Cannot enable audio and video export")
    check(project:SetRenderSettings({FormatWidth=1080, FormatHeight=1920}), "Cannot set the export size")
    check(manager:SaveProject(), "Cannot save the new Resolve project")
end
local ok, result = pcall(prepare)
write_status(ok and "ready" or ("error: " .. tostring(result)))
