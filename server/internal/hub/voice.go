package hub

// voice.go — in-memory voice state management.
// All exported methods are safe for concurrent use from readPump goroutines.

// JoinVoiceChannel moves userID into channelID.
// If the user was already in a different channel they are removed from it first.
// Returns the previous channelID (empty string if they weren't in any channel).
func (h *Hub) JoinVoiceChannel(userID, channelID string) (prev string) {
	h.voiceMu.Lock()
	defer h.voiceMu.Unlock()

	prev = h.userVoice[userID]

	// Remove from old channel if switching.
	if prev != "" && prev != channelID {
		delete(h.voiceState[prev], userID)
		if len(h.voiceState[prev]) == 0 {
			delete(h.voiceState, prev)
		}
	}

	if h.voiceState[channelID] == nil {
		h.voiceState[channelID] = make(map[string]struct{})
	}
	h.voiceState[channelID][userID] = struct{}{}
	h.userVoice[userID] = channelID
	return prev
}

// LeaveVoiceChannel removes userID from whichever channel they occupy.
// Returns the channelID they left and true, or ("", false) if they weren't in any.
func (h *Hub) LeaveVoiceChannel(userID string) (channelID string, was bool) {
	h.voiceMu.Lock()
	defer h.voiceMu.Unlock()

	channelID, was = h.userVoice[userID]
	if !was {
		return "", false
	}

	delete(h.userVoice, userID)
	delete(h.voiceState[channelID], userID)
	if len(h.voiceState[channelID]) == 0 {
		delete(h.voiceState, channelID)
	}
	return channelID, true
}

// VoiceChannelOf returns the channel the user is currently in, if any.
func (h *Hub) VoiceChannelOf(userID string) (channelID string, ok bool) {
	h.voiceMu.RLock()
	defer h.voiceMu.RUnlock()
	channelID, ok = h.userVoice[userID]
	return
}

// VoiceMembers returns a snapshot of userIDs currently in channelID.
func (h *Hub) VoiceMembers(channelID string) []string {
	h.voiceMu.RLock()
	defer h.voiceMu.RUnlock()

	users := h.voiceState[channelID]
	if len(users) == 0 {
		return nil
	}
	result := make([]string, 0, len(users))
	for uid := range users {
		result = append(result, uid)
	}
	return result
}
