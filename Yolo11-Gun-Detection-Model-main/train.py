from ultralytics import YOLO


# Load a model
if __name__ == '__main__':
    model = YOLO("yolo11n.pt")
    data_path = r"C:/Users/felix/Desktop/data/data.yaml" # path to dataset


    # Train the model
    train_results = model.train(
        data=data_path,  # path to dataset YAML
        epochs=10,  # number of training epochs
        imgsz=640,  # training image size
        device=0,  # device to run on, i.e. device=0 or device=0,1,2,3 or device=cpu
    )