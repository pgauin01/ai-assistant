import cv2

# 1. Load your full-screen screenshot
image_path = "Screenshot 2026-04-21 234632.png" 
img = cv2.imread(image_path)

# 2. Open the UI to draw a box
print("Click and drag to draw a box around the red section.")
print("Press ENTER to confirm, or 'c' to cancel.")
# ROI returns: (x, y, width, height)
roi = cv2.selectROI("Select Crop Area", img, fromCenter=False, showCrosshair=True)

# 3. Calculate left, top, right, bottom
left = roi[0]
top = roi[1]
right = roi[0] + roi[2]
bottom = roi[1] + roi[3]

print(f"\n✅ SUCCESS! Paste this into main.py:")
print(f"crop_box = ({left}, {top}, {right}, {bottom})")

cv2.destroyAllWindows()