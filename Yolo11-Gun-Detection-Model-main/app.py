from flask import Flask, request, jsonify
from flask_cors import CORS
import cv2
import base64
import numpy as np
from ultralytics import YOLO
import datetime
import os
import time

app = Flask(__name__)
CORS(app, supports_credentials=True)  # Enhanced CORS support

# Créer des dossiers pour sauvegarder les images
ALERTS_FOLDER = 'alerts'
VIDEO_ALERTS_FOLDER = os.path.join(ALERTS_FOLDER, 'videos')

for folder in [ALERTS_FOLDER, VIDEO_ALERTS_FOLDER]:
    if not os.path.exists(folder):
        os.makedirs(folder)

# Charger le modèle YOLO
model = YOLO("model.pt")
classnames = ['Gun']

# Seuils de confiance
CONFIDENCE_THRESHOLD = 70

@app.route('/stream', methods=['POST'])
def stream():
    try:
        start_time = time.time()  # Pour mesurer le temps de traitement
        
        data = request.json
        source = data.get('source', 'webcam')  # Ajouter une source pour distinguer webcam vs. vidéo
        image_data = data['image'].split(',')[1]  # Enlever "data:image/png;base64,"
        
        # Décoder l'image base64
        decoded_image = base64.b64decode(image_data)
        np_arr = np.frombuffer(decoded_image, np.uint8)
        frame = cv2.imdecode(np_arr, cv2.IMREAD_COLOR)
        
        # Si l'image est trop grande, la redimensionner pour accélérer le traitement
        max_dimension = 1280
        height, width = frame.shape[:2]
        if width > max_dimension or height > max_dimension:
            scale = max_dimension / max(width, height)
            frame = cv2.resize(frame, (int(width * scale), int(height * scale)))
        
        # Horodatage pour l'image
        current_time = datetime.datetime.now()
        timestamp = current_time.strftime("%Y-%m-%d %H:%M:%S")
        
        # Exécuter la détection
        results = model(frame)
        detections = []
        
        # Variable pour vérifier si on a des détections significatives
        has_significant_detection = False

        # Copie du cadre original pour ajouter des annotations
        annotated_frame = frame.copy()
        
        # Ajouter l'horodatage en bas à gauche
        cv2.putText(annotated_frame, timestamp, (10, annotated_frame.shape[0] - 10),
                    cv2.FONT_HERSHEY_SIMPLEX, 0.6, (255, 255, 255), 2)

        for info in results:
            for box in info.boxes:
                x1, y1, x2, y2 = map(int, box.xyxy[0])
                confidence = int(box.conf[0] * 100)
                class_detect = classnames[int(box.cls[0])]

                # Enregistrer toutes les détections, mais n'annoter que celles au-dessus du seuil
                detections.append({
                    'class': class_detect,
                    'confidence': confidence,
                    'bbox': [x1, y1, x2, y2]
                })
                
                if confidence > CONFIDENCE_THRESHOLD:
                    has_significant_detection = True
                    
                    # Dessiner un rectangle et un label sur l'image
                    cv2.rectangle(annotated_frame, (x1, y1), (x2, y2), (0, 0, 255), 2)
                    
                    # Fond pour le texte
                    text_size = cv2.getTextSize(f'{class_detect} {confidence}%', cv2.FONT_HERSHEY_SIMPLEX, 0.7, 2)[0]
                    cv2.rectangle(annotated_frame, (x1, y1 - 25), (x1 + text_size[0], y1), (0, 0, 255), -1)
                    
                    # Texte
                    cv2.putText(annotated_frame, f'{class_detect} {confidence}%', (x1, y1 - 5),
                               cv2.FONT_HERSHEY_SIMPLEX, 0.7, (255, 255, 255), 2)

        # Convertir l'image traitée en base64
        _, buffer = cv2.imencode('.jpg', annotated_frame)
        processed_image = base64.b64encode(buffer).decode('utf-8')
        
        # Si détection significative, sauvegarder l'image
        if has_significant_detection:
            target_folder = VIDEO_ALERTS_FOLDER if source == 'video' else ALERTS_FOLDER
            filename = f"alert_{source}_{current_time.strftime('%Y%m%d_%H%M%S')}.jpg"
            filepath = os.path.join(target_folder, filename)
            cv2.imwrite(filepath, annotated_frame)
        
        processing_time = time.time() - start_time

        return jsonify({
            'success': True,
            'detections': detections,
            'processed_image': f"data:image/jpeg;base64,{processed_image}",
            'timestamp': timestamp,
            'processing_time_ms': int(processing_time * 1000)
        })
    
    except Exception as e:
        import traceback
        print(traceback.format_exc())
        return jsonify({'success': False, 'error': str(e)}), 500

if __name__ == '__main__':
    app.run(host='0.0.0.0', port=5000, debug=True)