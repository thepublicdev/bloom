#!/bin/bash

# ==============================================================================
#
#  Webcam Shape Overlay Script for macOS
#
#  Description: This script captures a webcam feed, applies a geometric
#               shape mask (like a circle or rounded square), and displays
#               it as an always-on-top overlay on your screen.
#
#  Dependencies: ffmpeg, ImageMagick, mpv
#  To install: brew install ffmpeg imagemagick mpv
#
# ==============================================================================


# --- Main Configuration ---
# You can change these defaults if you like.
DEFAULT_RESOLUTION="1280x720"
DEFAULT_X_POS="50"
DEFAULT_Y_POS="50"


# --- Functions ---

# Function to check for required command-line tools.
check_dependencies() {
    local missing_deps=0
    for cmd in ffmpeg convert mpv; do
        if ! command -v "$cmd" &> /dev/null; then
            echo "❌ Error: Required command '$cmd' is not found."
            missing_deps=1
        fi
    done

    if [ "$missing_deps" -eq 1 ]; then
        echo "Please install the dependencies using Homebrew:"
        echo "brew install ffmpeg imagemagick mpv"
        exit 1
    fi
}

# Function to clean up the temporary mask file on exit.
cleanup() {
    echo -e "\n🧹 Cleaning up and exiting..."
    rm -f /tmp/webcam_mask.png
}


# --- Script Execution ---

# Set a trap to run the cleanup function when the script exits.
trap cleanup EXIT

clear
echo "🎬 Webcam Shape Overlay Script for macOS"
echo "========================================"

# 1. Verify that all required tools are installed.
check_dependencies

# 2. Select the Webcam.
echo
echo "🔎 Detecting video devices..."

# Function to list AVFoundation video devices using ffmpeg.
list_video_devices() {
    ffmpeg -f avfoundation -list_devices true -i "" 2>&1 \
        | grep --after-context=2 "AVFoundation video devices" \
        | grep "\[[0-9]\]" \
        | sed 's/\[AVFoundation input device @ .*\] //'
}

# Use a loop to populate the devices array from the function output.
devices=()
while IFS= read -r line; do
    devices+=("$line")
done < <(list_video_devices)

if [ ${#devices[@]} -eq 0 ]; then
    echo "❌ No video devices found. Make sure your webcam is connected."
    exit 1
fi

echo "Available video devices:"
i=0
for device in "${devices[@]}"; do
    # Display a clean, numbered list of devices.
    echo "  $i) ${device##*] }"
    let i++
done

# Prompt the user to choose a webcam.
read -p "Enter the number of the webcam to use: " cam_choice
# The user's choice corresponds directly to the ffmpeg device index
CAM_INDEX="$cam_choice"
CAM_NAME=$(echo "${devices[$cam_choice]}" | sed 's/\[[0-9]\] //')

echo "Selected: $CAM_NAME (Index: $CAM_INDEX)"

# Validate the user's selection: must be a valid array index and not empty.
if ! [[ "$cam_choice" =~ ^[0-9]+$ ]] || [ "$cam_choice" -lt 0 ] || [ "$cam_choice" -ge ${#devices[@]} ]; then
    echo "❌ Invalid selection. Please enter a number from the list."
    exit 1
fi
echo "✅ Using: $CAM_NAME"


# 3. Select the Overlay Shape.
echo
echo "🎨 Choose an overlay shape:"
echo "  1) Circle"
echo "  2) Rounded Square"
echo "  3) No Mask (Full Rectangle)"
read -p "Enter your choice (1, 2, or 3): " shape_choice


# 4. Configure Resolution and Position.
echo
echo "📐 Enter display settings (press Enter for defaults):"
read -p "Enter resolution [Default: $DEFAULT_RESOLUTION]: " RESOLUTION
read -p "Enter X position (from left) [Default: $DEFAULT_X_POS]: " POS_X
read -p "Enter Y position (from top) [Default: $DEFAULT_Y_POS]: " POS_Y

# Use default values if the user input is empty.
RESOLUTION=${RESOLUTION:-$DEFAULT_RESOLUTION}
POS_X=${POS_X:-$DEFAULT_X_POS}
POS_Y=${POS_Y:-$DEFAULT_Y_POS}

# Parse the width and height from the resolution string.
if [[ $RESOLUTION =~ ^([0-9]+)x([0-9]+)$ ]]; then
    W=${BASH_REMATCH[1]}
    H=${BASH_REMATCH[2]}
else
    echo "❌ Invalid resolution format. Exiting."
    exit 1
fi


# 5. Generate the Mask Image.
echo
echo "🖼️ Generating a mask for the selected shape..."
MASK_FILE="/tmp/webcam_mask.png"

case $shape_choice in
    1)
        SHAPE_NAME="Circle"
        # Use ImageMagick's 'convert' to draw a white circle on a transparent background.
        convert -size ${W}x${H} xc:transparent -fill white -draw "circle $((W/2)),$((H/2)) $((W/2)),0" "$MASK_FILE"
        USE_MASK=true
        ;;
    2)
        SHAPE_NAME="Rounded Square"
        # Calculate a corner radius as 20% of the smaller dimension.
        RADIUS=$(( $(($W < $H ? $W : $H)) / 5 ))
        # Use ImageMagick to draw a white rounded rectangle.
        convert -size ${W}x${H} xc:transparent -fill white -draw "roundrectangle 0,0,${W},${H},${RADIUS},${RADIUS}" "$MASK_FILE"
        USE_MASK=true
        ;;
    3)
        SHAPE_NAME="No Mask (Full Rectangle)"
        # No mask needed - will show full webcam feed
        USE_MASK=false
        ;;
    *)
        echo "❌ Invalid shape choice. Exiting."
        exit 1
        ;;
esac

if [ "$USE_MASK" = true ] && [ ! -f "$MASK_FILE" ]; then
    echo "❌ Failed to create the mask file. Exiting."
    exit 1
fi
echo "✅ Mask created successfully!"


# 6. Launch the Overlay!
echo
echo "🚀 Launching webcam overlay... (Press Ctrl+C in this terminal to stop)"
echo "-------------------------------------------------------------------"
echo "   - Device: $CAM_NAME (Index: $CAM_INDEX)"
echo "   - Shape: $SHAPE_NAME"
echo "   - Resolution: $RESOLUTION"
echo "   - Position: ${POS_X}x${POS_Y}"
echo "-------------------------------------------------------------------"

# This is the core command. It pipes the output of ffmpeg into mpv.
#
# FFmpeg part:
# - Grabs the webcam feed (-f avfoundation).
# - Takes the mask image as a second input (if using mask).
# - Merges the webcam's video with the mask's alpha channel (if using mask).
# - Outputs the result to standard output (-f matroska -).
#
# MPV part:
# - Reads the video stream from standard input (mpv -).
# - Uses options for low-latency live video playback (--profile=low-latency).
# - Displays the window without borders (--no-border) and on top of all other windows (--ontop).
# - Sets the window size and position (--geometry).
#
if [ "$USE_MASK" = true ]; then
    # Masked webcam feed with transparency (PNG codec, RGBA)
    ffmpeg -hide_banner -loglevel error \
           -f avfoundation -framerate 30 -video_size $RESOLUTION -i "${CAM_INDEX}:none" \
           -i "$MASK_FILE" \
           -filter_complex "[1:v]format=gray,geq=r='p(X,Y)':a='p(X,Y)'[alpha]; \
                            [0:v][alpha]alphamerge,format=rgba[out]" \
           -map "[out]" -f matroska -c:v png - \
    | mpv - --vo=gpu --profile=low-latency --untimed \
          --title="Webcam Overlay" \
          --no-border \
          --ontop \
          --geometry="${W}x${H}+${POS_X}+${POS_Y}"
else
    # Direct webcam feed (PNG codec, RGBA)
    ffmpeg -hide_banner -loglevel error \
           -f avfoundation -framerate 30 -video_size $RESOLUTION -i "${CAM_INDEX}:none" \
           -f matroska -c:v png - \
    | mpv - --vo=gpu --profile=low-latency --untimed \
          --title="Webcam Overlay" \
          --no-border \
          --ontop \
          --geometry="${W}x${H}+${POS_X}+${POS_Y}"
fi